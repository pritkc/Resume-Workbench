const changes = [
  {
    before: "Backend engineer building APIs and internal tools.",
    after: "Platform engineer building reliable APIs and developer tooling.",
    reason: "Matches the role language without adding a new claim.",
  },
  {
    before: "Improved data pipeline monitoring.",
    after: "Improved data pipeline observability and incident response.",
    reason: "Clarifies the verified impact already present in the source.",
  },
  {
    before: "Python, PostgreSQL, React",
    after: "Python, FastAPI, PostgreSQL, React",
    reason: "Surfaces a supported skill required by the job.",
  },
];

const tabs = [...document.querySelectorAll("[data-diff]")];
const before = document.querySelector("#diff-before");
const after = document.querySelector("#diff-after");
const reason = document.querySelector("#diff-reason");
const feedback = document.querySelector("#demo-feedback");

function selectChange(index) {
  const selected = changes[index];
  before.textContent = selected.before;
  after.textContent = selected.after;
  reason.textContent = selected.reason;
  feedback.textContent = "";

  tabs.forEach((tab, tabIndex) => {
    const active = tabIndex === index;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => selectChange(Number(tab.dataset.diff)));
});

document.querySelector("#reject-change").addEventListener("click", () => {
  feedback.textContent =
    "Demo change rejected. The source resume remains unchanged.";
});

document.querySelector("#confirm-change").addEventListener("click", () => {
  feedback.textContent = "Demo change confirmed. Nothing was sent or stored.";
});
