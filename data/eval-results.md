# RAG evaluation results

Run: 2026-11-05T03:55:41.776Z | top-k 6 | min similarity 0.45 | chat `gemini-3.6-flash` | embeddings `gemini-embedding-001`

## Summary

- Retrieval hit@6 (expected document in top-6): **10/10 (100%)**
- Hit@1: 10/10 | exact-page hit@6: 10/10 | MRR: 1
- Answers containing expected fact: 10/10; answered (not refused): 10/10
- Out-of-scope correctly refused: **2/2**

## Per question

| id | doc rank | page rank | top sim | answerable | has expected fact | question |
|---|---|---|---|---|---|---|
| q1 | 1 | 1 | 0.766 | true | true | From which date must taxpayers with annual turnover of more than RM25 million and up to RM100 million issue e-Invoices? |
| q2 | 1 | 1 | 0.75 | true | true | How many hours does a buyer have to request rejection of a validated e-Invoice that contains errors? |
| q3 | 1 | 2 | 0.77 | true | true | What is the threshold value for mandatory service tax registration for rental or leasing services? |
| q4 | 1 | 1 | 0.712 | true | true | What is the maximum fine for a registered person who furnishes an incorrect Service Tax return? |
| q5 | 1 | 3 | 0.79 | true | true | By when must a taxable person furnish the SST-02 return? |
| q6 | 1 | 1 | 0.767 | true | true | What is the service tax rate on management services and when did it take effect? |
| q7 | 1 | 1 | 0.78 | true | true | How many days must an individual be physically present in Malaysia in a basis year to be a tax resident under the 182-day rule? |
| q8 | 1 | 1 | 0.749 | true | true | What is the deduction limit for a gift of money made by an individual to an approved institution, organization or fund? |
| q9 | 1 | 1 | 0.758 | true | true | Which professional services are listed under Group G of the First Schedule of the Service Tax Regulations 2018? |
| q10 | 1 | 1 | 0.704 | true | true | Which currency exchange rate should a supplier use in an e-Invoice for a foreign currency transaction when no legal or tax requirement applies? |
| q11-oos | - | - | 0.605 | false | refused: true | What is the corporate income tax rate in Singapore for 2025? |
| q12-oos | - | - | 0.466 | false | refused: true | What is the best recipe for making sourdough bread at home? |
