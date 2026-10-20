# Official data sources

`scripts/build-official-data.mjs` turns these sources into
`api/data/generated/additives.generated.json`, which the app uses after the
hand-curated files in `api/data/`. A GitHub Action
(`.github/workflows/refresh-official-data.yml`) reruns it on the 1st of every
month, whenever one of the files below changes, or from the **Actions** tab
with **Run workflow**.

| Source | How it gets here | What it adds |
|---|---|---|
| Open Food Facts additives taxonomy | Downloaded automatically | ~720 additives: E/INS codes, names (incl. Hindi/Marathi), EFSA ADI and re-evaluation findings, vegan/vegetarian/palm-oil flags |
| `iarc.csv` (optional) | By hand: open the [IARC List of Classifications](https://monographs.iarc.who.int/list-of-classifications), click **CSV**, save the file here as `iarc.csv` | IARC cancer-hazard group, matched by agent name |
| `fssai.csv` (optional) | By hand from the [FSSAI Food Additives Regulations](https://fssai.gov.in/cms/Compendium-FSS-FPS-FA.php) | India-specific status per INS number |

## fssai.csv format

One row per INS number. Only add facts you have checked in the regulation text.

```csv
ins,status,note,source_url
211,Permitted,"Preservative; category-specific limits in Appendix A",https://fssai.gov.in/cms/Compendium-FSS-FPS-FA.php
```

## Run it yourself

```bash
node scripts/build-official-data.mjs            # downloads sources
node scripts/build-official-data.mjs --offline  # uses files already in this folder
```

## Licences

Open Food Facts data is under the Open Database Licence (ODbL 1.0). Credit
"Open Food Facts" wherever the data is shown (the app's footer does), and share
any database you build from it under the same licence. EFSA, IARC and FSSAI
remain the authorities behind the facts; link back to them, as each record's
`sourceLinks` does.
