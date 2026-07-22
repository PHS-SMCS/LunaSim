# LunaSim live API test cases

Run automated resolver tests from the repository root:

```powershell
npm test
```

## Manual browser tests

Before each case, create a Variable with the shown equation, connect required influence links only for ordinary LunaSim model references, and press **Run**. Live API references do not require influence arrows.

| Case | Equation | Expected result |
|---|---|---|
| Weather temperature | `[temp][10001]` | A numeric current temperature in °C. |
| Weather wind | `[wind][10001]` | A non-negative wind speed in km/h. |
| Weather humidity | `[humidity][10001]` | A value from 0–100. |
| Weather precipitation | `[precip][10001]` | A non-negative precipitation value in mm. |
| Air quality | `[aq][10001]` | A non-negative US AQI value. |
| GDP | `[gdp][US]` | Latest non-empty US GDP in current USD. |
| Inflation | `[inflation][US]` | Latest non-empty US CPI inflation percentage. |
| Unemployment | `[unemployment][US]` | Latest non-empty US unemployment percentage. |
| Population | `[population][US]` | Latest non-empty US population. |
| GNI per capita | `[gnipc][US]` | Latest non-empty US GNI per capita in current USD. |
| Trade | `[trade balance][US]` | Latest non-empty US trade as a percentage of GDP. |
| Stock quote | `[stock][AAPL]` | Current Finnhub quote after entering a valid key in Settings → Experimental. |
| Mixed equation | `[temp][10001] * 2 + [population][US]` | Both references resolve before numerical evaluation. |
| Repeated reference | `[humidity][10001] + [humidity][10001]` | Both terms match; browser network tools show only one geocode/weather lookup for the run. |
| Monte Carlo | Use `[temp][10001]` in a base variable, run normally, then run Monte Carlo on another parameter | Monte Carlo completes and uses the resolved live value as a constant seed across the ensemble. |

## Validation and failure cases

| Case | Equation/setup | Expected result |
|---|---|---|
| Invalid ZIP | `[temp][ABCDE]` | “Live API Error: Invalid US ZIP code.” |
| Unknown ZIP | `[temp][00000]` | “ZIP code not found” or an upstream request error. |
| Invalid country | `[population][USA]` | “Invalid ISO country code.” |
| Missing Finnhub key | `[stock][AAPL]` with an empty key | Error directs the user to Settings → Experimental. |
| Invalid ticker | `[stock][NOT/A/TICKER]` | “Invalid stock ticker.” |
| Offline mode | Disconnect the network and run any live equation | A live API request error or timeout appears; the simulation does not use stale or non-numeric data. |
| Autocomplete keyboard | Type `[` then select temperature with arrows and Enter | Input becomes `[temp][ZIP_CODE]`. |
| Autocomplete mouse | Type `[gdp` and click the GDP suggestion | Input becomes `[gdp][COUNTRY_CODE]`. |
| Normal model reference | Use `[Population]` | Existing reference and influence validation continue to work normally. |

Live values are resolved once before a normal simulation and stored in the translated run data. Monte Carlo uses that already-resolved base data for every worker, preventing hundreds of duplicate external requests.
