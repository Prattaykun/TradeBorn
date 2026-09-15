# Overlapping Trades

When signals fire while a previous position is still open, overlapping trades can:

- Count the same market regime multiple times
- Inflate win rates if one strong recovery period generates many overlapping entries
- Complicate capital and risk interpretation

## TradeBorn default

Overlapping trades are **disabled** by default. A new signal is ignored while an active trade is open.

Enable overlapping only when you intentionally want density-of-signal analysis and understand the dependence between observations.
