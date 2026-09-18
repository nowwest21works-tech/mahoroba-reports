# Sites release record

## Public release v3

- Date: 2026-09-18
- Audience: public (`access_mode: public`)
- Sites project: `appgprj_6aab88d8614c81918b0b7c354c354ee6`
- Sites version: 3
- Sites source commit: `6b5ac5b078b517f02402218e2b2109ed39f2ef5e`
- GitHub PR deployed content commit: `865254e89f7481db45e394b593a4cb5b2bf9bad6`
- Sites deployment: `appgdep_6aaca92d13488191856e377b0ec77b6a`
- URL: https://mahoroba-baachan-land-guide.nowwest21works.chatgpt.site
- Included public surface: `dist/` and `.openai/hosting.json`

The Sites source commit packages the same `dist/` state as the GitHub PR deployed content commit. This documentation-only release record is committed afterward and does not change the deployed surface. The PR remains Draft and is not merged.

Public release checks:

- `node --check dist/assets/app.js`: passed
- `node tests/recommendations.test.cjs`: passed (192 combinations)
- Playwright 390x844: passed; no horizontal overflow, all character/logo images loaded, back navigation preserved answers, restart cleared answers and memo, and the full three-question -> recommendations -> reflection -> LINE flow completed
- Playwright 1440x1000: passed; two-column layout rendered, no horizontal overflow, and all images loaded
- Browser console: 0 errors, 0 warnings
- Browser persistence: no localStorage, sessionStorage, or cookies
- Browser network during the local flow: 11 same-origin static requests only; no answer or memo transmission observed
- Public file scan: no authentication information, customer information, or internal notes found
- Sites access: `access_mode: public`; anonymous HTTP request returned `200 text/html` at the existing URL

## Private preview v2

- Date: 2026-09-17
- Audience: owner-only private preview
- Sites project: `appgprj_6aab88d8614c81918b0b7c354c354ee6`
- Sites version: 2
- Sites source commit: `6ac6335001bcf4f965d68603f728d14457ec9afe`
- GitHub PR content commit: `62f8416cf1d4ed4c6890f5b6d3f5156a799269d5`
- Sites deployment: `appgdep_6aabbd104e388191ad8f4713c2afbd2d`
- URL: https://mahoroba-baachan-land-guide.nowwest21works.chatgpt.site
- Included public surface: `dist/` and `.openai/hosting.json`

The Sites source commit packages the same `dist/` state as the GitHub PR content commit. A later PR-only documentation commit records this deployment and does not change the deployed surface.

Owner-only access was re-verified before deployment: one owner, no groups, and no external visitors. Public access, external sharing, and replacement of any existing Site remain behind the Human Gate.
