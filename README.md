# CanTax

Canadian income tax estimates for the 2025 tax year. Enter an income, pick a province or territory, and it shows federal and provincial tax, CPP/CPP2/EI, average and marginal rates, and a bracket-by-bracket breakdown. Recalculates as you type.

Live demo: https://noahbulbring.github.io/cantax/

![CanTax screenshot](screenshot.png)

## What it covers

- Federal brackets plus all 10 provinces and 3 territories, including Ontario's surtax and health premium and the Quebec federal abatement
- CPP, the CPP2 second earnings ceiling, and EI (Quebec rates handled separately)
- Basic personal amounts, including the federal BPA phase-out for high earners

## Run it

No build step, no dependencies — plain HTML/CSS/JS, everything runs in the browser.

```bash
git clone https://github.com/NoahBulbring/cantax.git
cd cantax
open index.html
```

## How it works

`tax-data.js` holds the 2025 rate tables (CRA indexed amounts and provincial budgets). `app.js` runs a standard progressive-bracket calculation, applies non-refundable basic-personal-amount credits at the lowest bracket rate, then layers on jurisdiction-specific rules (Ontario surtax and health premium, Quebec 16.5% abatement) and payroll contributions.

The federal first-bracket rate is shown as 14.5% for 2025 — the legislated mid-year rate cut (15% Jan–Jun, 14% Jul–Dec) averages to 14.5% for the full tax year.

## Limitations

Estimates only. Excludes credits beyond the basic personal amounts (no employment amount, tuition, medical, etc.), QPIP, and benefit clawbacks. Not tax, accounting, or legal advice.

## License

MIT © Noah Bulbring
