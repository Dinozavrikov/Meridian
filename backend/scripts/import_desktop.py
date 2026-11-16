import asyncio, json, sys, re
from datetime import datetime
import asyncpg

def pdt(s):
    return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")

async def main():
    if len(sys.argv) != 2:
        print("Использование: python3 scripts/import_desktop.py <user_id>")
        sys.exit(1)
    user_id = int(sys.argv[1])

    with open("/app/import_data.json", encoding="utf-8") as f:
        d = json.load(f)

    dsn = "postgresql://meridian:meridian_dev_pass@postgres:5432/meridian"
    conn = await asyncpg.connect(dsn)

    async with conn.transaction():
        # observations
        for o in d["observations"]:
            await conn.execute(
                """INSERT INTO observations (id, user_id, date, author, title, text, status, importance, visibility, lab_id, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,'осмысленное',0,'private',NULL,$7,$8)""",
                o["id"], user_id, o["date"], o["author"], o.get("title",""), o["text"], pdt(o["created_at"]), pdt(o["updated_at"]),
            )

        # hypotheses
        for h in d["hypotheses"]:
            await conn.execute(
                """INSERT INTO hypotheses (id, user_id, name, description, date_created, status, stability, research_load, maturity, risk, visibility, lab_id, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'private',NULL,$10,$11)""",
                h["id"], user_id, h["name"], h["description"], h["date_created"], h["status"],
                h.get("stability",0), h.get("research_load",0), h.get("maturity",0),
                pdt(h["created_at"]), pdt(h["updated_at"]),
            )

        # predictions
        for p in d["predictions"]:
            await conn.execute(
                """INSERT INTO predictions (id, user_id, title, text, date_created, expected_check_date, hypothesis_id, status, confidence, result_notes, visibility, reminder_sent, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'private',false,$11,$12)""",
                p["id"], user_id, p.get("title",""), p["text"], p["date_created"], p.get("expected_check_date",""),
                p.get("hypothesis_id"), p["status"], p.get("confidence"), p.get("result_notes",""),
                pdt(p["created_at"]), pdt(p["updated_at"]),
            )

        # worldview
        for w in d["worldview"]:
            await conn.execute(
                """INSERT INTO worldview (id, user_id, date, belief, status, confirming_data, refuting_data, confidence, visibility, lab_id, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'private',NULL,$9,$10)""",
                w["id"], user_id, w["date"], w["belief"], w["status"],
                w.get("confirming_data",""), w.get("refuting_data",""), w.get("confidence"),
                pdt(w["created_at"]), pdt(w["updated_at"]),
            )

        # questions
        for q in d["questions"]:
            await conn.execute(
                """INSERT INTO questions (id, user_id, title, text, status, priority, importance, answer, date_created, visibility, lab_id, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,'private',NULL,$9,$10)""",
                q["id"], user_id, q["title"], q.get("text",""), q["status"], q.get("priority","средний"),
                q.get("answer",""), q["date_created"], pdt(q["created_at"]), pdt(q["updated_at"]),
            )

        # tasks -> research_tasks
        for t in d["tasks"]:
            await conn.execute(
                """INSERT INTO research_tasks (id, user_id, name, description, status, progress, visibility, lab_id, created_at, updated_at)
                   VALUES ($1,$2,$3,$4,$5,0,'private',NULL,$6,$7)""",
                t["id"], user_id, t["name"], t.get("description",""), t["status"],
                pdt(t["created_at"]), pdt(t["updated_at"]),
            )

        # tags
        for tg in d["tags"]:
            await conn.execute(
                "INSERT INTO tags (id, user_id, name) VALUES ($1,$2,$3)",
                tg["id"], user_id, tg["name"],
            )

        # entity_tags
        for et in d["entity_tags"]:
            await conn.execute(
                "INSERT INTO entity_tags (entity_type, entity_id, tag_id) VALUES ($1,$2,$3)",
                et["entity_type"], et["entity_id"], et["tag_id"],
            )

        # links
        for l in d["links"]:
            await conn.execute(
                """INSERT INTO links (id, user_id, from_type, from_id, to_type, to_id, link_type)
                   VALUES ($1,$2,$3,$4,$5,$6,$7)""",
                l["id"], user_id, l["from_type"], l["from_id"], l["to_type"], l["to_id"], l.get("link_type","related"),
            )

        # hyp_status_history
        for hh in d["hyp_status_history"]:
            await conn.execute(
                "INSERT INTO hyp_status_history (id, hypothesis_id, status, changed_at) VALUES ($1,$2,$3,$4)",
                hh["id"], hh["hypothesis_id"], hh["status"], hh["changed_at"],
            )

        # scale_defs (десктопная шкала) -> новая кастомная ScaleDef
        old_to_new_scale_id = {}
        for sd in d["scale_defs"]:
            labels_dict = json.loads(sd.get("value_labels", "{}"))
            levels = [{"value": float(v), "label": lbl, "desc": ""} for v, lbl in sorted(labels_dict.items(), key=lambda x: float(x[0]))]
            entity_type = "hypothesis" if "гипотез" in sd.get("categories","").lower() else "hypothesis"
            new_id = await conn.fetchval(
                """INSERT INTO scale_defs (user_id, builtin_key, entity_type, name, description, min_val, max_val, step, group_by, color, levels)
                   VALUES ($1, NULL, $2, $3, $4, $5, $6, 1, 'none', '#7C70F5', $7) RETURNING id""",
                user_id, entity_type, sd["name"], sd.get("description",""),
                sd["min_val"], sd["max_val"], json.dumps(levels),
            )
            old_to_new_scale_id[sd["id"]] = new_id

        # scale_values -> универсальная таблица (entity_type='hypothesis')
        for sv in d["scale_values"]:
            new_scale_id = old_to_new_scale_id.get(sv["scale_id"])
            if new_scale_id is None:
                continue
            await conn.execute(
                """INSERT INTO scale_values (user_id, entity_type, entity_id, scale_id, value)
                   VALUES ($1, 'hypothesis', $2, $3, $4)""",
                user_id, sv["hypothesis_id"], f"custom_{new_scale_id}", float(sv["value"]),
            )

        # сброс sequence-счётчиков под явно вставленные id
        for table in ["observations","hypotheses","predictions","worldview","questions","research_tasks","tags","links","scale_defs","hyp_status_history"]:
            await conn.execute(f"SELECT setval(pg_get_serial_sequence('{table}','id'), COALESCE((SELECT MAX(id) FROM {table}), 1))")

    await conn.close()
    print("Импорт завершён успешно.")

asyncio.run(main())
