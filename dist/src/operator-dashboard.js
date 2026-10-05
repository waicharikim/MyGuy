"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.operatorDashboardHtml = void 0;
exports.operatorDashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Shauri Operator Desk</title>
  <style>
    :root { color-scheme: light; font: 16px/1.45 system-ui,sans-serif; color: #17211b; background: #f3f6f3; }
    body { max-width: 1100px; margin: 0 auto; padding: 24px; }
    h1,h2 { margin: 0 0 12px; } h1 { font-size: 1.8rem; }
    section,.card,.metric { background: white; border: 1px solid #dbe3dc; border-radius: 10px; padding: 16px; margin: 14px 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(170px,1fr)); gap: 10px; }
    .metric strong { display:block; font-size: 1.4rem; }
    .muted { color:#59665d; font-size:.92rem; }
    button { cursor:pointer; border:0; border-radius:6px; background:#175d3a; color:white; padding:9px 12px; margin:4px 6px 4px 0; }
    button.secondary { background:#47564c; }
    input,select { padding:8px; border:1px solid #aebbb0; border-radius:5px; margin:4px; }
    pre { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; background:#f5f7f5; padding:10px; border-radius:6px; }
    #message { min-height:1.4em; color:#8a321f; }
  </style>
</head>
<body>
  <h1>Shauri Operator Desk</h1>
  <p class="muted">Operator data is loaded only after authentication. The token is kept in this browser tab's session storage.</p>
  <section>
    <label for="token">Operator token</label>
    <input id="token" type="password" autocomplete="current-password">
    <button id="load">Load queue and metrics</button>
    <button id="clear" class="secondary">Clear token</button>
    <div id="message" role="status"></div>
  </section>
  <section>
    <h2>Decision quality</h2>
    <div id="metrics" class="grid"></div>
  </section>
  <section>
    <h2>Open human queries and escalations</h2>
    <div id="queue"></div>
  </section>
  <section>
    <h2>Outcome reports awaiting review</h2>
    <div id="outcomes"></div>
  </section>
<script>
(() => {
  const tokenInput = document.getElementById("token");
  const message = document.getElementById("message");
  const metrics = document.getElementById("metrics");
  const queue = document.getElementById("queue");
  const outcomes = document.getElementById("outcomes");
  tokenInput.value = sessionStorage.getItem("shauriOperatorToken") || "";

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function addMetric(label, value) {
    const card = el("div", null, "metric");
    card.append(el("strong", value === null ? "—" : value), el("span", label, "muted"));
    metrics.append(card);
  }
  async function request(path, options) {
    const response = await fetch("/internal/human/" + path, {
      ...options,
      headers: {
        "x-operator-token": tokenInput.value,
        "content-type": "application/json",
        ...(options && options.headers ? options.headers : {})
      }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("Request failed (" + response.status + "): " + detail);
    }
    return response.json();
  }
  function decisionText(thread) {
    const decision = (thread.decisionRecords || [])[0];
    const section = el("div");
    section.append(el("p", "User: " + (thread.user ? thread.user.phone : "unknown")));
    section.append(el("p", "Matter: " + ((decision && decision.matter) || thread.decisionSummary || "Not summarized")));
    if (decision) {
      section.append(el("p", "Goal: " + (decision.goal || "Not recorded")));
      section.append(el("p", "Recommendation: " + (decision.recommendedOption || "No recommendation yet")));
      section.append(el("p", "Confidence estimate: " + (decision.confidence === null ? "Unavailable" : Math.round(decision.confidence * 100) + "%")));
      section.append(el("p", "Risks: " + ((decision.risks || []).join("; ") || "None recorded")));
      section.append(el("p", "Assumptions: " + ((decision.assumptions || []).join("; ") || "None recorded")));
      section.append(el("p", "Open questions: " + ((decision.unresolvedQuestions || []).join("; ") || "None recorded")));
    }
    section.append(el("p", "Known: " + ((thread.known || []).join("; ") || "None recorded")));
    section.append(el("p", "Open: " + ((thread.open || []).join("; ") || "None recorded")));
    const evidence = thread.groundingEvidence || [];
    if (evidence.length) {
      const list = el("ul");
      evidence.forEach(item => {
        const li = el("li");
        li.append(el("span", (item.claim || "") + ": " + (item.finding || "") + " "));
        let safeUrl;
        try {
          safeUrl = new URL(item.sourceUrl);
        } catch (_) {}
        if (safeUrl && (safeUrl.protocol === "https:" || safeUrl.protocol === "http:")) {
          const link = el("a", item.sourceTitle || safeUrl.href);
          link.href = safeUrl.href;
          link.rel = "noopener noreferrer";
          link.target = "_blank";
          li.append(link);
        } else {
          li.append(el("span", item.sourceTitle || item.sourceUrl));
        }
        list.append(li);
      });
      section.append(list);
    }
    return section;
  }
  function renderQueue(data) {
    queue.replaceChildren();
    const entries = [
      ...(data.humanQueries || []).map(item => ({ type: "Human query", item })),
      ...(data.escalations || []).map(item => ({ type: "Escalation", item }))
    ];
    if (!entries.length) queue.append(el("p", "No open handoffs."));
    entries.forEach(({type, item}) => {
      const card = el("article", null, "card");
      card.append(el("h3", type + " · " + item.matter));
      card.append(el("p", item.question || item.reason));
      card.append(el("p", item.reason || ""));
      if (item.operatorNotification) {
        const notification = item.operatorNotification;
        card.append(el("p", notification.sentAt
          ? "Operator alert sent."
          : "Operator alert pending (attempts: " + notification.attempts + ")" +
            (notification.lastError ? " — " + notification.lastError : "")));
      }
      if (item.thread) card.append(decisionText(item.thread));
      if (type === "Human query") {
        const answer = el("button", "Answer query");
        answer.onclick = async () => {
          const value = prompt("Operator answer");
          if (!value) return;
          await request("queries/" + encodeURIComponent(item.id) + "/answer", {
            method: "POST", body: JSON.stringify({answer:value})
          });
          await load();
        };
        card.append(answer);
      } else {
        const resolve = el("button", "Resolve escalation");
        resolve.onclick = async () => {
          const value = prompt("Resolution note");
          if (!value) return;
          await request("escalations/" + encodeURIComponent(item.id) + "/resolve", {
            method: "POST", body: JSON.stringify({answer:value})
          });
          await load();
        };
        card.append(resolve);
      }
      queue.append(card);
    });
  }
  function renderOutcomes(items) {
    outcomes.replaceChildren();
    if (!items.length) outcomes.append(el("p", "No outcome reports awaiting review."));
    items.forEach(item => {
      const card = el("article", null, "card");
      card.append(el("h3", item.matter));
      card.append(el("p", "User: " + item.user.phone));
      card.append(el("pre", item.outcomeNotes));
      card.append(el("p", "Recommendation: " + (item.recommendedOption || "Not recorded")));
      const select = document.createElement("select");
      ["SUCCESSFUL","PARTIAL","UNSUCCESSFUL","NO_ACTION","UNCLEAR"].forEach(status => {
        select.append(el("option", status));
      });
      const notes = document.createElement("input");
      notes.placeholder = "Operator review notes (optional)";
      notes.setAttribute("aria-label", "Operator review notes");
      const submit = el("button", "Save classification");
      submit.onclick = async () => {
        await request("decisions/" + encodeURIComponent(item.threadId) + "/outcome", {
          method: "POST",
          body: JSON.stringify({status:select.value, notes:notes.value})
        });
        await load();
      };
      card.append(select, notes, submit);
      outcomes.append(card);
    });
  }
  async function load() {
    message.textContent = "";
    const secret = tokenInput.value.trim();
    if (!secret) {
      message.textContent = "Enter the operator token.";
      return;
    }
    tokenInput.value = secret;
    sessionStorage.setItem("shauriOperatorToken", secret);
    try {
      const [quality, handoffs, reports] = await Promise.all([
        request("metrics"),
        request("queue"),
        request("outcomes")
      ]);
      metrics.replaceChildren();
      addMetric("Total decisions", quality.decisions.total);
      addMetric("Resolved", quality.decisions.byStatus.RESOLVED);
      addMetric("Awaiting human", quality.decisions.byStatus.AWAITING_HUMAN);
      addMetric("Escalated", quality.decisions.byStatus.ESCALATED);
      addMetric("Resolution rate", quality.decisions.resolutionRate === null ? null : Math.round(quality.decisions.resolutionRate * 100) + "%");
      addMetric("Recommendation coverage", quality.decisions.recommendationCoverage === null ? null : Math.round(quality.decisions.recommendationCoverage * 100) + "%");
      addMetric("Recommendation confirmation", quality.decisions.recommendationConfirmationRate === null ? null : Math.round(quality.decisions.recommendationConfirmationRate * 100) + "%");
      addMetric("Evidence rate", quality.decisions.evidenceRate === null ? null : Math.round(quality.decisions.evidenceRate * 100) + "%");
      addMetric("Low-confidence recommendations (<50%)", quality.decisions.lowConfidenceRecommendations);
      addMetric("Average hours to recommendation", quality.decisions.averageHoursToRecommendation === null ? null : Math.round(quality.decisions.averageHoursToRecommendation * 10) / 10);
      addMetric("Open decisions stalled >7 days", quality.decisions.staleOpenBeyondSevenDays);
      addMetric("Operator query response rate", quality.handoffs.operatorQueryResponseRate === null ? null : Math.round(quality.handoffs.operatorQueryResponseRate * 100) + "%");
      addMetric("Escalation resolution rate", quality.handoffs.escalationResolutionRate === null ? null : Math.round(quality.handoffs.escalationResolutionRate * 100) + "%");
      addMetric("Returning users (2+ WhatsApp days)", quality.users.returnRate === null ? null : Math.round(quality.users.returnRate * 100) + "%");
      addMetric("Outcome reports", quality.outcomes.userReported);
      addMetric("Pending review", quality.outcomes.pendingReview);
      addMetric("Successful among reviewed actions", quality.outcomes.successfulRateAmongClassifiedActions === null ? null : Math.round(quality.outcomes.successfulRateAmongClassifiedActions * 100) + "%");
      renderQueue(handoffs);
      renderOutcomes(reports);
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : String(error);
    }
  }
  document.getElementById("load").onclick = load;
  document.getElementById("clear").onclick = () => {
    sessionStorage.removeItem("shauriOperatorToken");
    tokenInput.value = "";
    metrics.replaceChildren();
    queue.replaceChildren();
    outcomes.replaceChildren();
    message.textContent = "Operator token cleared.";
  };
  if (tokenInput.value) load();
})();
</script>
</body>
</html>`;
