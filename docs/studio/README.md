# Studio review records

Working records kept because they hold decisions that are not fully recorded in the cards.

## T10A-12 `DISTRICT_ROLE_MIX` (Studio, 2026-10-22)

- `T10A-12-mix-verdict.md` — the review of record: the unit defect (a per-mille table
  cannot express a count cap), the reference-map footprint measurement, the character
  judgement per district row, and the 50 proposed per-mille values.
- `T10A-12-mix-handover.md` — the card-ready text for the re-cut: the unit statement,
  the count-cap side table, the two authorised number changes, the preferred-facility
  statement and the strengthened count-cap AC.

**Disposition (verified against `origin/main`, 2026-10-23).** The substantive rulings are
in `export/build-plan/cards/10A/T10A-12.md`, so these files are a record, not the only copy:

| Item | State |
|---|---|
| Unit statement, "within-row only" | In the card (landed) |
| Count-cap side table + `AC-10A-12-COUNT-CAP` | In the card (landed) |
| `TROPHY_RES x FOOD_HOSPITALITY` 80 -> 20 | Landed: card and `rules.ts` `MIX_ROWS` |
| `INDUSTRIAL x TECH_AI` 100 -> 40 | Landed: card and `rules.ts` `MIX_ROWS` |
| Cap-binding fixture (3 CBD / 4 trophy parcels) | In the card (landed) |
| **The 50 proposed per-mille values** | **HELD, never applied** — a held decision, recorded here and in board task `t_f0db2fb4` |

The 50 values were held pending a basis question (which map the card is calibrated
against, and the parcel count per district assumed). They are preserved here so the
decision cannot be lost with a worktree.
