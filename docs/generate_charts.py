import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from pathlib import Path

OUT = Path(__file__).parent
TEAL = '#0f766e'
CORAL = '#e11d48'
AMBER = '#d97706'
SLATE = '#334155'
LIGHT = '#f0fdf4'
GRID = '#e2e8f0'

plt.rcParams.update({
    'font.family': 'DejaVu Sans',
    'axes.facecolor': LIGHT,
    'figure.facecolor': 'white',
    'axes.grid': True,
    'grid.color': GRID,
    'grid.linewidth': 0.8,
    'axes.spines.top': False,
    'axes.spines.right': False,
    'axes.titlesize': 13,
    'axes.titleweight': 'bold',
    'axes.titlepad': 12,
})


# ── 1. LTV vs CAC ────────────────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(7, 5))
labels = ['CAC', 'LTV']
values = [2250, 42500]
colors = [CORAL, TEAL]
bars = ax.bar(labels, values, color=colors, width=0.45, zorder=3)
for bar, val in zip(bars, values):
    ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 600,
            f'${val:,.0f}', ha='center', va='bottom', fontsize=12, fontweight='bold')
ax.set_title('LTV vs CAC')
ax.set_ylabel('USD')
ax.set_ylim(0, 48000)
ax.text(0.98, 0.95, 'LTV/CAC = 18.9×', transform=ax.transAxes,
        ha='right', va='top', fontsize=11, color=TEAL,
        bbox=dict(boxstyle='round,pad=0.4', facecolor='#ccfbf1', edgecolor=TEAL))
fig.tight_layout()
fig.savefig(OUT / '01_ltv_vs_cac.png', dpi=150)
plt.close(fig)


# ── 2. CAC Payback Timeline ───────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(8, 5))
months = np.array([0, 1, 2, 3, 4, 5, 6])
monthly_profit = 637.50
cumulative = monthly_profit * months
ax.fill_between(months, cumulative, alpha=0.25, color=TEAL)
ax.plot(months, cumulative, color=TEAL, linewidth=2.5, marker='o', markersize=6, zorder=3)
ax.axhline(2250, color=CORAL, linewidth=1.8, linestyle='--', label='CAC $2,250')
ax.axvline(2250 / monthly_profit, color=AMBER, linewidth=1.5, linestyle=':', label='Break-even ~3.5 мес')
for m, c in zip(months, cumulative):
    ax.text(m, c + 60, f'${c:,.0f}', ha='center', fontsize=8.5, color=SLATE)
ax.set_title('Окупаемость CAC (нарастающий итог)')
ax.set_xlabel('Месяц')
ax.set_ylabel('Накопленная прибыль, USD')
ax.set_xticks(months)
ax.legend(framealpha=0.9)
fig.tight_layout()
fig.savefig(OUT / '02_cac_payback.png', dpi=150)
plt.close(fig)


# ── 3. Gross Margin by Revenue Stream ────────────────────────────────────────
fig, ax = plt.subplots(figsize=(7, 5))
streams = ['Оборудование\n(единоразово)', 'Подписка\n(ежемесячно)']
margins = [20, 85]
colors3 = [AMBER, TEAL]
bars3 = ax.bar(streams, margins, color=colors3, width=0.4, zorder=3)
for bar, val in zip(bars3, margins):
    ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1.5,
            f'{val}%', ha='center', va='bottom', fontsize=14, fontweight='bold')
ax.set_title('Валовая маржа по потокам дохода')
ax.set_ylabel('%')
ax.set_ylim(0, 100)
ax.axhline(85, color=TEAL, linewidth=0.6, linestyle='--', alpha=0.4)
fig.tight_layout()
fig.savefig(OUT / '03_gross_margin.png', dpi=150)
plt.close(fig)


# ── 4. Insurance Value: Loss vs Contract ─────────────────────────────────────
fig, ax = plt.subplots(figsize=(9, 5))
scenarios = ['DCIM-инцидент', 'Порча продукции\n(розница)', 'Простой\nинфраструктуры']
losses = [150000, 55000, 82500]
contract = 9000
x = np.arange(len(scenarios))
w = 0.35
b1 = ax.bar(x - w / 2, losses, w, color=CORAL, label='Потенциальный убыток', zorder=3)
b2 = ax.bar(x + w / 2, [contract] * 3, w, color=TEAL, label='Годовой контракт $9k', zorder=3)
for bar, val in zip(b1, losses):
    ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1500,
            f'${val:,.0f}', ha='center', fontsize=9, fontweight='bold', color=CORAL)
ax.text(b2[0].get_x() + b2[0].get_width() / 2, contract + 1500,
        f'${contract:,}', ha='center', fontsize=9, fontweight='bold', color=TEAL)
ax.set_title('Страховая ценность PulseTok: убыток vs стоимость контракта')
ax.set_xticks(x)
ax.set_xticklabels(scenarios)
ax.set_ylabel('USD')
ax.legend()
fig.tight_layout()
fig.savefig(OUT / '04_insurance_value.png', dpi=150)
plt.close(fig)


# ── 5. OPEX Savings Over Time ─────────────────────────────────────────────────
fig, ax = plt.subplots(figsize=(9, 5))
months5 = np.arange(1, 13)
savings_pct = [0, 5, 10, 20, 22, 24, 25, 26, 27, 28, 29, 30]
ax.fill_between(months5, savings_pct, alpha=0.3, color=TEAL)
ax.plot(months5, savings_pct, color=TEAL, linewidth=2.5, marker='o', markersize=6, zorder=3)
ax.axhspan(0, 10, alpha=0.04, color=AMBER, label='Фаза 1 (мес 1-3): до 10%')
ax.axhspan(10, 30, alpha=0.04, color=TEAL, label='Фаза 2 (мес 4-12): 20-30%')
ax.set_title('Экономия OPEX по месяцам')
ax.set_xlabel('Месяц')
ax.set_ylabel('Экономия OPEX, %')
ax.set_xticks(months5)
ax.set_ylim(0, 35)
ax.legend(framealpha=0.9)
for m, s in zip(months5, savings_pct):
    if s > 0:
        ax.text(m, s + 0.8, f'{s}%', ha='center', fontsize=8, color=SLATE)
fig.tight_layout()
fig.savefig(OUT / '05_opex_savings.png', dpi=150)
plt.close(fig)


# ── 6. Market Growth KPIs ─────────────────────────────────────────────────────
fig, axes = plt.subplots(1, 2, figsize=(11, 5))

# left: bar — market growth rates
ax6a = axes[0]
kpis = ['Smart DCIM\n2024 рост', 'Predictive AI\nCAGR до 2029']
vals6 = [64, 35]
bars6 = ax6a.bar(kpis, vals6, color=[TEAL, CORAL], width=0.4, zorder=3)
for bar, val in zip(bars6, vals6):
    ax6a.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1,
              f'{val}%', ha='center', fontsize=14, fontweight='bold')
ax6a.set_title('Темпы роста рынка')
ax6a.set_ylabel('%')
ax6a.set_ylim(0, 80)

# right: bar — Traditional vs IoT cost per location
ax6b = axes[1]
solutions = ['Традиционная\nBMS/CapEx', 'IoT/SaaS\n(PulseTok)']
costs = [50000, 1625]
c_colors = [CORAL, TEAL]
bars6b = ax6b.bar(solutions, costs, color=c_colors, width=0.4, zorder=3)
for bar, val in zip(bars6b, costs):
    ax6b.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 400,
              f'${val:,.0f}', ha='center', fontsize=11, fontweight='bold')
ax6b.set_title('Стоимость на объект: традиционное vs IoT')
ax6b.set_ylabel('USD')

fig.suptitle('Рыночные KPI', fontsize=14, fontweight='bold', y=1.01)
fig.tight_layout()
fig.savefig(OUT / '06_market_kpis.png', dpi=150, bbox_inches='tight')
plt.close(fig)

print("Done: 6 PNG files saved to", OUT)
