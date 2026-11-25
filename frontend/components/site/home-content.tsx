"use client"
import { HomeHero } from "@/components/site/home-hero"
import { HomeSteps, HomeComputes, HomeRecords } from "@/components/site/home-blocks"
import { HomeAudience, HomeData, HomeFinal } from "@/components/site/home-more"

/** Главная страница: первый экран с примером паспорта идеи и шесть разделов. */
export function HomeContent() {
  return (
    <>
      <HomeHero />
      <HomeSteps />
      <HomeComputes />
      <HomeRecords />
      <HomeAudience />
      <HomeData />
      <HomeFinal />
      <div style={{ height: 72 }} />
    </>
  )
}
