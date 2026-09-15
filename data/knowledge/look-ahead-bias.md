# Look-ahead Bias in Backtesting

Look-ahead bias occurs when a strategy uses information that would not have been available at the time of the trade decision.

## Common forms

- Entering at the same-session close after observing that close to form a signal.
- Using revised economic data as if it were known on the release date.
- Filtering the universe with future survivorship information.

## TradeBorn mitigation

Signals are evaluated at the close of session `t`. Entry occurs at the **next** session open (`t+1`). This prevents the strategy from acting on a close it could not have traded at after observing it.

## Why it matters

Even small amounts of look-ahead bias can inflate historical performance and create false confidence in a hypothesis.
