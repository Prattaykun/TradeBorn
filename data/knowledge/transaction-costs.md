# Transaction Costs and Slippage

Historical returns without costs overstate real-world outcomes.

## Simplified cost model used in TradeBorn

Net return approximates:

`NetReturn = GrossReturn - EntrySlippage - ExitSlippage - Fees`

Default prototype assumptions:

- Entry slippage: 5 basis points
- Exit slippage: 5 basis points
- Round-trip fee/cost proxy: 10 basis points total when configured that way

## Limitations

This model does not capture brokerage tiers, taxes, market impact, bid-ask bounce, or index tracking error. Treat costs as an editable assumption, not a complete execution simulator.
