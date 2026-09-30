# Shauri Information Authority Model

## Purpose

Shauri must distinguish **missing information** from **who is authorized to establish that information**. The model can identify an information need; deterministic orchestration decides the source.

## Source classes

| Fact type | Authoritative source | Examples |
|---|---|---|
| USER_INTENT | USER | What the user wants to accomplish |
| USER_PREFERENCE | USER | Preferred option, priorities |
| USER_EXPERIENCE | USER | What happened to the user |
| SYSTEM_STATE | SYSTEM | Project status, membership, payment state |
| POLICY | SYSTEM | Stored rules and approved policy |
| ORGANIZATIONAL_KNOWLEDGE | OPERATOR | Internal rationale, local organizational knowledge |
| HUMAN_VERIFICATION | OPERATOR | Exception approval, manual verification |
| EXTERNAL_FACT | EXTERNAL | Current public facts, external evidence |

## Runtime rule

The LLM should return an `InformationNeed` rather than directly deciding to escalate:

```text
fact
factType
required
reason
confidence
```

`source-resolver.ts` maps `factType` to the authoritative source.

The orchestration layer then performs one of four actions:

```text
USER      -> ask the user in the active conversation
SYSTEM    -> query application state/tools
EXTERNAL  -> retrieve external evidence
OPERATOR  -> create HumanQuery and pause for operator response
```

## User vs operator pause state

`Thread.awaitingSource` explicitly distinguishes:

- `USER`: the next inbound user response may satisfy the open HumanQuery.
- `OPERATOR`: an operator must answer through the internal endpoint; arbitrary user messages do not satisfy the query.
- `NONE`: no human answer is pending.

This prevents the previous ambiguity where `awaitingHuman=true` meant both "ask the user" and "wait for staff".

## Provenance

Human answers are persisted as `KnowledgeCandidate` records and added to thread knowledge with explicit human provenance. Future versions should extend provenance to `SYSTEM_VERIFIED`, `EXTERNAL_VERIFIED`, `USER_REPORTED`, `OPERATOR_VERIFIED`, and `MODEL_INFERENCE` so reasoning can distinguish evidence from inference.
