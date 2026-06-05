import sys
import io
import os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
import numpy as np

DOCS = r"C:\Users\Sergej\Documents\GitHub\tkdBot\MyHouse\docs"

# ── Chart 1: KPI Grid (replaces img0) ────────────────────────────────────────
fig, axes = plt.subplots(1, 4, figsize=(13.6, 2.82), facecolor="white")
fig.subplots_adjust(left=0.01, right=0.99, top=0.88, bottom=0.12, wspace=0.1)

metrics = [
    ("80K", "Средний чек (ARPU)", "руб/месяц"),
    ("75%", "Маржинальность", "Gross Margin  ✓ бенчмарк 70–80%"),
    ("1.71M", "LTV клиента", "за ~28 месяцев"),
    ("6.1", "LTV / CAC", "Top Quartile  ✓ бенчмарк 3.2"),
]

for ax, (big, label, sub) in zip(axes, metrics):
    ax.set_facecolor("white")
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    # big number
    ax.text(0.5, 0.70, big, ha="center", va="center",
            fontsize=38, fontweight="bold", color="#1a1a1a",
            fontfamily="DejaVu Sans")
    # label
    ax.text(0.5, 0.38, label, ha="center", va="center",
            fontsize=11, fontweight="bold", color="#1a1a1a",
            fontfamily="DejaVu Sans")
    # sub
    ax.text(0.5, 0.18, sub, ha="center", va="center",
            fontsize=8.5, color="#555555",
            fontfamily="DejaVu Sans")

    # divider line between cells (except last)
    if big != "6.1":
        ax.axvline(x=0.98, color="#dddddd", linewidth=1.2)

out0 = os.path.join(DOCS, "slide6_new_kpi.png")
fig.savefig(out0, dpi=150, bbox_inches="tight", facecolor="white")
plt.close(fig)
print(f"Saved: {out0}")


# ── Chart 2: Comparison bar charts (replaces img1) ───────────────────────────
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.6, 2.82), facecolor="white")
fig.subplots_adjust(left=0.06, right=0.96, top=0.80, bottom=0.22, wspace=0.45)

GREEN = "#2ecc71"
GRAY  = "#cccccc"
DARK  = "#1a1a1a"

# --- LTV/CAC ---
labels1 = ["PulseTok", "Рынок SaaS"]
values1 = [6.1, 3.2]
colors1 = [GREEN, GRAY]
bars1 = ax1.barh(labels1, values1, color=colors1, height=0.45, zorder=3)
ax1.set_xlim(0, 8)
ax1.axvline(x=3.0, color="#e74c3c", linewidth=1.2, linestyle="--", label="Min 3.0")
ax1.set_title("LTV / CAC", fontsize=12, fontweight="bold", color=DARK, pad=8)
ax1.set_xlabel("ratio", fontsize=9, color="#555555")
ax1.tick_params(axis="y", labelsize=10)
ax1.tick_params(axis="x", labelsize=9)
ax1.spines["top"].set_visible(False)
ax1.spines["right"].set_visible(False)
ax1.set_facecolor("white")
for bar, val in zip(bars1, values1):
    ax1.text(bar.get_width() + 0.15, bar.get_y() + bar.get_height()/2,
             f"{val}", va="center", fontsize=11, fontweight="bold", color=DARK)
ax1.legend(fontsize=8, loc="lower right", framealpha=0.5)

# --- CAC Payback ---
labels2 = ["PulseTok", "Рынок Mid-Market"]
values2 = [4.6, 16.0]
colors2 = [GREEN, GRAY]
bars2 = ax2.barh(labels2, values2, color=colors2, height=0.45, zorder=3)
ax2.set_xlim(0, 22)
ax2.axvline(x=8.0, color="#e74c3c", linewidth=1.2, linestyle="--", label="Best-in-class 8 мес")
ax2.set_title("CAC Payback Period", fontsize=12, fontweight="bold", color=DARK, pad=8)
ax2.set_xlabel("месяцев", fontsize=9, color="#555555")
ax2.tick_params(axis="y", labelsize=10)
ax2.tick_params(axis="x", labelsize=9)
ax2.spines["top"].set_visible(False)
ax2.spines["right"].set_visible(False)
ax2.set_facecolor("white")
for bar, val in zip(bars2, values2):
    label = f"{val} мес" if val < 10 else f"{val} мес  (рынок)"
    ax2.text(bar.get_width() + 0.3, bar.get_y() + bar.get_height()/2,
             f"{val}", va="center", fontsize=11, fontweight="bold", color=DARK)
ax2.legend(fontsize=8, loc="lower right", framealpha=0.5)

# caption
fig.text(0.5, 0.02,
         "ARPU 245K→80K: переход к Mid-Market ускоряет цикл сделки с 6 до 1–3 мес",
         ha="center", fontsize=9, color="#555555", style="italic")

out1 = os.path.join(DOCS, "slide6_new_chart.png")
fig.savefig(out1, dpi=150, bbox_inches="tight", facecolor="white")
plt.close(fig)
print(f"Saved: {out1}")
