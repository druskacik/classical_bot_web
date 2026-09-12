---
title: "Scaling classical music concert crawlers with AI agents"
description: "Short report on how we are creating the largest classical music concerts database on the internet"
date: "2026-09-12"
---

ClassicalBot now covers over 70 000 future classical music concerts from over 4 000 global sources. It was achieved without a significant human labor or investment, for a cost of a single AI subscription (Codex).

![An orchestra on stage in a grand concert hall, with the audience seated around it.](/blog/orchestra-concert-hall.webp){width="1600" height="800"}

:small[Photo by Sichen Xiang on [Unsplash](https://unsplash.com/photos/a-symphony-orchestra-performs-in-a-grand-concert-hall-ZlOWGrqJKu8).]{.photo-credit .text-gray-600}

## The problem

The first version of this portal, [classical.sk](https://classical.sk), covered classical music concerts in Slovakia, my home country. Slovakia is a small country and there aren’t that many websites with information on classical music concerts happening there. Building the database for Slovakia consisted of 3 steps:

1. identifying websites with classical music concerts (philharmonies, festivals, town websites, etc.)

2. building working crawlers for each of them

3. postprocessing (cleaning, deduplication, programme extraction)

Step 1 was achievable by a simple research, step 2 was more complicated: implementing a crawler for a website could take anywhere from 5 minutes (if there existed some internal API that offered the structured data directly) to a few hours (if scraping required HTML processing with an unclear heuristic). Step 3 used an LLM API.

Step 2 is definitely the most “load-bearing” (can’t believe I’m using this word unironically) part of the whole setup. What’s notable about it is that it consists of tasks that are non-trivial to solve and that are completely independent: a crawler for wondrous-string-quartet.com has nothing to do with crawler for whimsical-orchestra.com, they could be done in any order, one of them could work and one of them not, it doesn’t matter.

What this means that if we had a setup where the step 2 could be done automatically, it could be safely scaled to whole world.

## The setup

The idea is this: we need a magic box where we plug in an url, and the magic box produces a working crawler (“script”) we can run for “free”. Magic box like this would probably be unimaginable in the BC era of programming, but today’s AI is magical enough to be able to do this.

![A URL goes into a magic box, which produces a crawler script.](/blog/crawler-factory-magic-box.png){width="1200" height="440"}

How: in the early experiments, I worked with LLM APIs with a bunch of tools (website visit tool, coding tool, etc.). I actually got some prototype working with [Gemini 2.5 Pro](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro) and HuggingFace’s [smolagents](https://huggingface.co/docs/smolagents/index) library in summer of 2025, but it had issues: it barely worked, and it was too costly. Maybe it was good enough for some flashy demo I could use to get a few millions in a startup investment, but it wasn’t enough to build a working product. So in 2025, I decided to let it be.

In 2026, the situation improved a lot. The coding agents are now smarter and cheaper, and there are better tools to work with them directly in code ([Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) from OpenAI, [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) from Anthropic). Having a coding agent solve a list of tasks is currently as simple as writing a good prompt and a python for-loop.

How it works technically:

1. there’s a queue of urls to process (taken from [WikiData](https://www.wikidata.org/wiki/Wikidata:Main_Page), AI deep researches, custom lists)

2. the system takes a batch of unprocessed urls, sends them to the “magic box”

3. “magic box” attempts to create a crawler for classical music concerts; irrelevant urls are dropped and marked

4. the crawler scripts are sent to a deterministic validation (check if the output is filled, has a good enough data quality, etc.); unsuccessful urls are sent for one retry to the “magic box” before marking as eligible for retry in a later batch

5. validated scripts are sent to a GitHub PR, validated again, and auto-merged

The steps 2-5 are repeated until the queue of urls is exhausted. This workflow is what I call a “crawler factory”, and when working non-concurrently it can process cca 10 urls per hour, packaged into 2 GitHub PRs and 2 fully unsupervised [GitHub Action](https://docs.github.com/en/actions) runs, a minor but honest contribution in [overloading GitHub servers](https://www.githubstatus.com/incidents/zkxwbgr0cnmx).

By the way, while crawler factory is where the Codex SDK agents are the most useful, there are other use cases for it. The postprocessing (step 3 from above – extracting programmes of the concerts) used to be handled by an LLM API, but now it’s migrated to GPT-5.6-Luna agents. The benefit is it that it has the context of the codebase, and can be prompted to do “side-quests”, e.g. creating a GitHub issues if it notices a systematic problems in the crawler code – and these issues can then be fixed by another “factory”. While these simpler tasks do not necessarily require agents, my bet is that this is the future: the models will only get better and cheaper, and testing their limits today will help me appreciate the progress that is to come.

## The Future

There’s no reason to stop here, this idea of automated crawler factory could be extended to any use case. We could create a loop to cover all restaurant menus in a city, eshop prices, job offers, all kinds of events, company data, … With enough compute budget it could be possible to make the whole web “structured”. The dream that the [Schema.org](https://schema.org/) project had could be achieved not by the web creators having to follow a pre-defined schemas to make their content parseable, but by parsing the unstructured content directly with AI. I can imagine a [CommonCrawl](https://commoncrawl.org/) equivalent where the data isn’t free-form, but structured, and fetching e.g. all today’s restaurant menus is just an API call away.
