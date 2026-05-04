# Ubiquitous Language

## Audio narration

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Article Reader** | The UI control on a documentation page that lets a visitor listen to the current article. | Audio widget, listen button |
| **Narration** | A spoken rendering of a documentation page's readable prose. | Audio, TTS output |
| **Browser Narration** | Narration synthesized by the visitor's browser using the native Web Speech API. | Local TTS, native TTS |
| **Audio Opt-out** | Frontmatter that disables the Article Reader for a page. | Disable audio, no reader |

## Synthesis and playback

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Web Speech Engine** | The browser-native `speechSynthesis` implementation used by the Article Reader. | VITS, cloud TTS |
| **System Voice** | A browser-provided voice available through `speechSynthesis.getVoices()`. | Model voice, provider voice |
| **Playback Session** | One active run of speaking, pausing, resuming, or stopping narration. | Run, audio session |
| **Unsupported Browser** | A browser that lacks the Web Speech APIs required to show the Article Reader. | VITS failure, fallback |

## Retired concepts

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **VITS Engine** | A previously considered in-browser neural synthesis provider backed by Piper VITS models and ONNX/WASM. | vits-web, neural engine |
| **Studio Narration** | A previously considered pre-generated narration file served as a static asset for a specific page. | Studio voice, generated MP3 |
| **Provider Engine** | A previously considered build-time synthesis provider such as OpenAI or MiniMax. | Cloud TTS, API TTS |

## Relationships

- An **Article Reader** appears on a documentation page unless the page has an **Audio Opt-out**.
- An **Article Reader** starts a **Playback Session** using the **Web Speech Engine**.
- A **Playback Session** may use one selected **System Voice**.
- An **Unsupported Browser** sees no **Article Reader**.
- **VITS Engine**, **Studio Narration**, and **Provider Engine** are intentionally out of scope for the native-browser implementation.

## Example dialogue

> **Dev:** "Should the **Article Reader** download a VITS model when a visitor presses Listen?"
>
> **Domain expert:** "No. A visitor-triggered listen should use **Browser Narration** through the **Web Speech Engine**."
>
> **Dev:** "Where do voices come from?"
>
> **Domain expert:** "From the browser's available **System Voices**."
>
> **Dev:** "How do we keep audio off index pages?"
>
> **Domain expert:** "Add an **Audio Opt-out** with `audio: false` frontmatter."

## Flagged ambiguities

- "Audio" can mean a feature, spoken output, or playback lifecycle; use **Article Reader**, **Narration**, or **Playback Session** depending on intent.
- "Voice" should mean a **System Voice** exposed by Web Speech, not a cloud provider or VITS model.
- "Native" means browser-native Web Speech, not native Node or OS-level synthesis in the build process.
