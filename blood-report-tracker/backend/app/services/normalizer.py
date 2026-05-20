import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.metric import CanonicalMetric

logger = logging.getLogger(__name__)


async def normalize_metric_name(
    raw_name: str, db_session: AsyncSession
) -> Optional[CanonicalMetric]:
    """
    Tries to find a CanonicalMetric that matches raw_name via:
    1. Exact match on canonical_name
    2. Exact match in aliases list (JSON contains check)
    3. Case-insensitive contains check on canonical_name or aliases

    Returns the matching CanonicalMetric, or None if no match found.
    """
    normalized = raw_name.strip()

    # 1. Exact match on canonical_name
    result = await db_session.execute(
        select(CanonicalMetric).where(CanonicalMetric.canonical_name == normalized)
    )
    match = result.scalar_one_or_none()
    if match:
        return match

    # 2. Load all metrics and check aliases + fuzzy match
    all_metrics_result = await db_session.execute(select(CanonicalMetric))
    all_metrics = all_metrics_result.scalars().all()

    normalized_lower = normalized.lower()

    # Exact alias match
    for metric in all_metrics:
        aliases = metric.aliases or []
        if normalized in aliases:
            return metric
        if normalized_lower in [a.lower() for a in aliases]:
            return metric

    # Case-insensitive contains check on canonical_name
    for metric in all_metrics:
        if normalized_lower == metric.canonical_name.lower():
            return metric

    # Fuzzy: canonical_name contains raw_name or raw_name contains canonical_name
    for metric in all_metrics:
        canon_lower = metric.canonical_name.lower()
        if normalized_lower in canon_lower or canon_lower in normalized_lower:
            return metric

        # Check aliases for contains
        aliases = metric.aliases or []
        for alias in aliases:
            alias_lower = alias.lower()
            if normalized_lower in alias_lower or alias_lower in normalized_lower:
                return metric

    return None


# ─── Seed Data ────────────────────────────────────────────────────────────────

CANONICAL_METRICS_SEED = [
    # ── CBC ──────────────────────────────────────────────────────────────────
    {
        "canonical_name": "Hemoglobin",
        "panel_name": "CBC",
        "aliases": ["Hgb", "Hb", "HGB", "haemoglobin"],
        "default_unit": "g/dL",
        "typical_min": 12.0,
        "typical_max": 17.5,
    },
    {
        "canonical_name": "Hematocrit",
        "panel_name": "CBC",
        "aliases": ["HCT", "Hct", "Packed Cell Volume", "PCV"],
        "default_unit": "%",
        "typical_min": 36.0,
        "typical_max": 52.0,
    },
    {
        "canonical_name": "RBC Count",
        "panel_name": "CBC",
        "aliases": ["RBC", "Red Blood Cell Count", "Erythrocyte Count"],
        "default_unit": "10^6/µL",
        "typical_min": 4.0,
        "typical_max": 6.2,
    },
    {
        "canonical_name": "WBC Count",
        "panel_name": "CBC",
        "aliases": ["WBC", "White Blood Cell Count", "Leukocyte Count", "TLC"],
        "default_unit": "10^3/µL",
        "typical_min": 4.0,
        "typical_max": 11.0,
    },
    {
        "canonical_name": "Platelet Count",
        "panel_name": "CBC",
        "aliases": ["PLT", "Platelets", "Thrombocyte Count"],
        "default_unit": "10^3/µL",
        "typical_min": 150.0,
        "typical_max": 400.0,
    },
    {
        "canonical_name": "MCV",
        "panel_name": "CBC",
        "aliases": ["Mean Corpuscular Volume", "Mean Cell Volume"],
        "default_unit": "fL",
        "typical_min": 80.0,
        "typical_max": 100.0,
    },
    {
        "canonical_name": "MCH",
        "panel_name": "CBC",
        "aliases": ["Mean Corpuscular Hemoglobin", "Mean Cell Hemoglobin"],
        "default_unit": "pg",
        "typical_min": 27.0,
        "typical_max": 33.0,
    },
    {
        "canonical_name": "MCHC",
        "panel_name": "CBC",
        "aliases": ["Mean Corpuscular Hemoglobin Concentration"],
        "default_unit": "g/dL",
        "typical_min": 31.0,
        "typical_max": 36.0,
    },
    {
        "canonical_name": "RDW",
        "panel_name": "CBC",
        "aliases": ["Red Cell Distribution Width", "RDW-CV"],
        "default_unit": "%",
        "typical_min": 11.5,
        "typical_max": 14.5,
    },
    {
        "canonical_name": "Neutrophils",
        "panel_name": "CBC",
        "aliases": ["Neutrophil Count", "Neutrophils %", "Neut", "PMN"],
        "default_unit": "%",
        "typical_min": 40.0,
        "typical_max": 75.0,
    },
    {
        "canonical_name": "Lymphocytes",
        "panel_name": "CBC",
        "aliases": ["Lymphocyte Count", "Lymphocytes %", "Lymph"],
        "default_unit": "%",
        "typical_min": 20.0,
        "typical_max": 45.0,
    },
    {
        "canonical_name": "Monocytes",
        "panel_name": "CBC",
        "aliases": ["Monocyte Count", "Monocytes %", "Mono"],
        "default_unit": "%",
        "typical_min": 2.0,
        "typical_max": 10.0,
    },
    {
        "canonical_name": "Eosinophils",
        "panel_name": "CBC",
        "aliases": ["Eosinophil Count", "Eosinophils %", "Eos"],
        "default_unit": "%",
        "typical_min": 1.0,
        "typical_max": 6.0,
    },
    {
        "canonical_name": "Basophils",
        "panel_name": "CBC",
        "aliases": ["Basophil Count", "Basophils %", "Baso"],
        "default_unit": "%",
        "typical_min": 0.0,
        "typical_max": 1.0,
    },
    # ── Lipid Profile ─────────────────────────────────────────────────────────
    {
        "canonical_name": "Total Cholesterol",
        "panel_name": "Lipid Profile",
        "aliases": ["Cholesterol", "Cholesterol Total", "TC"],
        "default_unit": "mg/dL",
        "typical_min": None,
        "typical_max": 200.0,
    },
    {
        "canonical_name": "LDL Cholesterol",
        "panel_name": "Lipid Profile",
        "aliases": ["LDL", "LDL-C", "Low Density Lipoprotein"],
        "default_unit": "mg/dL",
        "typical_min": None,
        "typical_max": 100.0,
    },
    {
        "canonical_name": "HDL Cholesterol",
        "panel_name": "Lipid Profile",
        "aliases": ["HDL", "HDL-C", "High Density Lipoprotein"],
        "default_unit": "mg/dL",
        "typical_min": 40.0,
        "typical_max": None,
    },
    {
        "canonical_name": "Triglycerides",
        "panel_name": "Lipid Profile",
        "aliases": ["TG", "Trig", "VLDL Triglycerides"],
        "default_unit": "mg/dL",
        "typical_min": None,
        "typical_max": 150.0,
    },
    {
        "canonical_name": "VLDL Cholesterol",
        "panel_name": "Lipid Profile",
        "aliases": ["VLDL", "VLDL-C", "Very Low Density Lipoprotein"],
        "default_unit": "mg/dL",
        "typical_min": None,
        "typical_max": 30.0,
    },
    {
        "canonical_name": "Non-HDL Cholesterol",
        "panel_name": "Lipid Profile",
        "aliases": ["Non HDL Cholesterol", "Non-HDL-C"],
        "default_unit": "mg/dL",
        "typical_min": None,
        "typical_max": 130.0,
    },
    # ── Liver Function ────────────────────────────────────────────────────────
    {
        "canonical_name": "ALT",
        "panel_name": "Liver Function",
        "aliases": ["SGPT", "Alanine Aminotransferase", "Alanine Transaminase"],
        "default_unit": "U/L",
        "typical_min": 7.0,
        "typical_max": 56.0,
    },
    {
        "canonical_name": "AST",
        "panel_name": "Liver Function",
        "aliases": ["SGOT", "Aspartate Aminotransferase", "Aspartate Transaminase"],
        "default_unit": "U/L",
        "typical_min": 10.0,
        "typical_max": 40.0,
    },
    {
        "canonical_name": "ALP",
        "panel_name": "Liver Function",
        "aliases": ["Alkaline Phosphatase", "Alk Phos"],
        "default_unit": "U/L",
        "typical_min": 44.0,
        "typical_max": 147.0,
    },
    {
        "canonical_name": "Total Bilirubin",
        "panel_name": "Liver Function",
        "aliases": ["T. Bili", "T-Bili", "Bilirubin Total"],
        "default_unit": "mg/dL",
        "typical_min": 0.2,
        "typical_max": 1.2,
    },
    {
        "canonical_name": "Direct Bilirubin",
        "panel_name": "Liver Function",
        "aliases": ["D. Bili", "Direct Bili", "Conjugated Bilirubin"],
        "default_unit": "mg/dL",
        "typical_min": 0.0,
        "typical_max": 0.3,
    },
    {
        "canonical_name": "Indirect Bilirubin",
        "panel_name": "Liver Function",
        "aliases": ["Unconjugated Bilirubin", "Indirect Bili"],
        "default_unit": "mg/dL",
        "typical_min": 0.2,
        "typical_max": 0.9,
    },
    {
        "canonical_name": "Total Protein",
        "panel_name": "Liver Function",
        "aliases": ["TP", "Protein Total"],
        "default_unit": "g/dL",
        "typical_min": 6.0,
        "typical_max": 8.3,
    },
    {
        "canonical_name": "Albumin",
        "panel_name": "Liver Function",
        "aliases": ["Alb", "Serum Albumin"],
        "default_unit": "g/dL",
        "typical_min": 3.5,
        "typical_max": 5.0,
    },
    {
        "canonical_name": "Globulin",
        "panel_name": "Liver Function",
        "aliases": ["Serum Globulin"],
        "default_unit": "g/dL",
        "typical_min": 2.0,
        "typical_max": 3.5,
    },
    {
        "canonical_name": "GGT",
        "panel_name": "Liver Function",
        "aliases": ["Gamma-GT", "Gamma Glutamyl Transferase", "Gamma Glutamyl Transpeptidase"],
        "default_unit": "U/L",
        "typical_min": 9.0,
        "typical_max": 48.0,
    },
    # ── Kidney Function ───────────────────────────────────────────────────────
    {
        "canonical_name": "Creatinine",
        "panel_name": "Kidney Function",
        "aliases": ["Serum Creatinine", "Creat", "Cr"],
        "default_unit": "mg/dL",
        "typical_min": 0.6,
        "typical_max": 1.2,
    },
    {
        "canonical_name": "Blood Urea Nitrogen",
        "panel_name": "Kidney Function",
        "aliases": ["BUN", "Urea Nitrogen", "Blood Urea"],
        "default_unit": "mg/dL",
        "typical_min": 7.0,
        "typical_max": 20.0,
    },
    {
        "canonical_name": "Urea",
        "panel_name": "Kidney Function",
        "aliases": ["Serum Urea", "Urea (Blood)"],
        "default_unit": "mg/dL",
        "typical_min": 15.0,
        "typical_max": 45.0,
    },
    {
        "canonical_name": "eGFR",
        "panel_name": "Kidney Function",
        "aliases": ["Estimated GFR", "Glomerular Filtration Rate", "GFR"],
        "default_unit": "mL/min/1.73m²",
        "typical_min": 60.0,
        "typical_max": None,
    },
    {
        "canonical_name": "Uric Acid",
        "panel_name": "Kidney Function",
        "aliases": ["Serum Uric Acid", "UA"],
        "default_unit": "mg/dL",
        "typical_min": 2.4,
        "typical_max": 7.0,
    },
    # ── Electrolytes ──────────────────────────────────────────────────────────
    {
        "canonical_name": "Sodium",
        "panel_name": "Electrolytes",
        "aliases": ["Na", "Na+", "Serum Sodium"],
        "default_unit": "mEq/L",
        "typical_min": 136.0,
        "typical_max": 145.0,
    },
    {
        "canonical_name": "Potassium",
        "panel_name": "Electrolytes",
        "aliases": ["K", "K+", "Serum Potassium"],
        "default_unit": "mEq/L",
        "typical_min": 3.5,
        "typical_max": 5.1,
    },
    {
        "canonical_name": "Chloride",
        "panel_name": "Electrolytes",
        "aliases": ["Cl", "Cl-", "Serum Chloride"],
        "default_unit": "mEq/L",
        "typical_min": 98.0,
        "typical_max": 107.0,
    },
    {
        "canonical_name": "Bicarbonate",
        "panel_name": "Electrolytes",
        "aliases": ["HCO3", "CO2", "Carbon Dioxide", "Bicarb"],
        "default_unit": "mEq/L",
        "typical_min": 22.0,
        "typical_max": 29.0,
    },
    {
        "canonical_name": "Calcium",
        "panel_name": "Electrolytes",
        "aliases": ["Ca", "Ca2+", "Serum Calcium"],
        "default_unit": "mg/dL",
        "typical_min": 8.5,
        "typical_max": 10.5,
    },
    {
        "canonical_name": "Phosphorus",
        "panel_name": "Electrolytes",
        "aliases": ["Phosphate", "Phos", "Serum Phosphorus", "Inorganic Phosphorus"],
        "default_unit": "mg/dL",
        "typical_min": 2.5,
        "typical_max": 4.5,
    },
    {
        "canonical_name": "Magnesium",
        "panel_name": "Electrolytes",
        "aliases": ["Mg", "Mg2+", "Serum Magnesium"],
        "default_unit": "mg/dL",
        "typical_min": 1.7,
        "typical_max": 2.2,
    },
    # ── Thyroid Function ──────────────────────────────────────────────────────
    {
        "canonical_name": "TSH",
        "panel_name": "Thyroid Function",
        "aliases": ["Thyroid Stimulating Hormone", "Thyrotropin"],
        "default_unit": "µIU/mL",
        "typical_min": 0.4,
        "typical_max": 4.0,
    },
    {
        "canonical_name": "Free T4",
        "panel_name": "Thyroid Function",
        "aliases": ["FT4", "Free Thyroxine", "fT4"],
        "default_unit": "ng/dL",
        "typical_min": 0.8,
        "typical_max": 1.8,
    },
    {
        "canonical_name": "Free T3",
        "panel_name": "Thyroid Function",
        "aliases": ["FT3", "Free Triiodothyronine", "fT3"],
        "default_unit": "pg/mL",
        "typical_min": 2.3,
        "typical_max": 4.2,
    },
    {
        "canonical_name": "Total T4",
        "panel_name": "Thyroid Function",
        "aliases": ["T4", "Thyroxine Total", "T4 Total"],
        "default_unit": "µg/dL",
        "typical_min": 5.0,
        "typical_max": 12.0,
    },
    {
        "canonical_name": "Total T3",
        "panel_name": "Thyroid Function",
        "aliases": ["T3", "Triiodothyronine Total", "T3 Total"],
        "default_unit": "ng/dL",
        "typical_min": 80.0,
        "typical_max": 200.0,
    },
    # ── Diabetes / Glucose ────────────────────────────────────────────────────
    {
        "canonical_name": "Fasting Blood Glucose",
        "panel_name": "Diabetes",
        "aliases": ["FBG", "Fasting Glucose", "FPG", "Fasting Blood Sugar", "FBS"],
        "default_unit": "mg/dL",
        "typical_min": 70.0,
        "typical_max": 100.0,
    },
    {
        "canonical_name": "HbA1c",
        "panel_name": "Diabetes",
        "aliases": ["Glycated Hemoglobin", "Hemoglobin A1c", "A1c", "HbA1C", "Glycohemoglobin"],
        "default_unit": "%",
        "typical_min": None,
        "typical_max": 5.7,
    },
    {
        "canonical_name": "Postprandial Blood Glucose",
        "panel_name": "Diabetes",
        "aliases": ["PPBG", "Post Meal Glucose", "2-Hour Glucose", "PP Glucose", "PP Blood Sugar"],
        "default_unit": "mg/dL",
        "typical_min": None,
        "typical_max": 140.0,
    },
    {
        "canonical_name": "Fasting Insulin",
        "panel_name": "Diabetes",
        "aliases": ["Insulin Fasting", "Serum Insulin"],
        "default_unit": "µIU/mL",
        "typical_min": 2.0,
        "typical_max": 25.0,
    },
    # ── Iron Studies ──────────────────────────────────────────────────────────
    {
        "canonical_name": "Serum Iron",
        "panel_name": "Iron Studies",
        "aliases": ["Iron", "Fe", "Iron Serum"],
        "default_unit": "µg/dL",
        "typical_min": 60.0,
        "typical_max": 170.0,
    },
    {
        "canonical_name": "TIBC",
        "panel_name": "Iron Studies",
        "aliases": ["Total Iron Binding Capacity", "Iron Binding Capacity"],
        "default_unit": "µg/dL",
        "typical_min": 250.0,
        "typical_max": 370.0,
    },
    {
        "canonical_name": "Transferrin Saturation",
        "panel_name": "Iron Studies",
        "aliases": ["% Transferrin Saturation", "Iron Saturation", "TSAT"],
        "default_unit": "%",
        "typical_min": 20.0,
        "typical_max": 50.0,
    },
    {
        "canonical_name": "Ferritin",
        "panel_name": "Iron Studies",
        "aliases": ["Serum Ferritin"],
        "default_unit": "ng/mL",
        "typical_min": 12.0,
        "typical_max": 300.0,
    },
    # ── Vitamins ──────────────────────────────────────────────────────────────
    {
        "canonical_name": "Vitamin D",
        "panel_name": "Vitamins",
        "aliases": ["25-OH Vitamin D", "25-Hydroxyvitamin D", "Vitamin D3", "Vit D", "25(OH)D"],
        "default_unit": "ng/mL",
        "typical_min": 30.0,
        "typical_max": 100.0,
    },
    {
        "canonical_name": "Vitamin B12",
        "panel_name": "Vitamins",
        "aliases": ["B12", "Cobalamin", "Cyanocobalamin", "Vit B12"],
        "default_unit": "pg/mL",
        "typical_min": 200.0,
        "typical_max": 900.0,
    },
    {
        "canonical_name": "Folate",
        "panel_name": "Vitamins",
        "aliases": ["Folic Acid", "Serum Folate", "Vitamin B9"],
        "default_unit": "ng/mL",
        "typical_min": 2.7,
        "typical_max": 17.0,
    },
    # ── Inflammatory Markers ──────────────────────────────────────────────────
    {
        "canonical_name": "CRP",
        "panel_name": "Inflammatory Markers",
        "aliases": ["C-Reactive Protein", "C Reactive Protein", "hsCRP", "hs-CRP", "High Sensitivity CRP"],
        "default_unit": "mg/L",
        "typical_min": None,
        "typical_max": 10.0,
    },
    {
        "canonical_name": "ESR",
        "panel_name": "Inflammatory Markers",
        "aliases": ["Erythrocyte Sedimentation Rate", "Westergren ESR"],
        "default_unit": "mm/hr",
        "typical_min": None,
        "typical_max": 20.0,
    },
    # ── Coagulation ───────────────────────────────────────────────────────────
    {
        "canonical_name": "PT",
        "panel_name": "Coagulation",
        "aliases": ["Prothrombin Time", "Pro Time"],
        "default_unit": "seconds",
        "typical_min": 11.0,
        "typical_max": 13.5,
    },
    {
        "canonical_name": "INR",
        "panel_name": "Coagulation",
        "aliases": ["International Normalized Ratio", "PT-INR"],
        "default_unit": "",
        "typical_min": 0.8,
        "typical_max": 1.2,
    },
    {
        "canonical_name": "aPTT",
        "panel_name": "Coagulation",
        "aliases": ["Activated Partial Thromboplastin Time", "PTT", "APTT"],
        "default_unit": "seconds",
        "typical_min": 25.0,
        "typical_max": 35.0,
    },
    # ── Hormones ──────────────────────────────────────────────────────────────
    {
        "canonical_name": "Testosterone",
        "panel_name": "Hormones",
        "aliases": ["Total Testosterone", "Serum Testosterone"],
        "default_unit": "ng/dL",
        "typical_min": 300.0,
        "typical_max": 1000.0,
    },
    {
        "canonical_name": "Estradiol",
        "panel_name": "Hormones",
        "aliases": ["E2", "Oestradiol", "17-beta Estradiol"],
        "default_unit": "pg/mL",
        "typical_min": None,
        "typical_max": None,
    },
    {
        "canonical_name": "Cortisol",
        "panel_name": "Hormones",
        "aliases": ["Serum Cortisol", "AM Cortisol", "Morning Cortisol"],
        "default_unit": "µg/dL",
        "typical_min": 6.2,
        "typical_max": 19.4,
    },
    {
        "canonical_name": "FSH",
        "panel_name": "Hormones",
        "aliases": ["Follicle Stimulating Hormone"],
        "default_unit": "mIU/mL",
        "typical_min": None,
        "typical_max": None,
    },
    {
        "canonical_name": "LH",
        "panel_name": "Hormones",
        "aliases": ["Luteinizing Hormone"],
        "default_unit": "mIU/mL",
        "typical_min": None,
        "typical_max": None,
    },
    {
        "canonical_name": "Prolactin",
        "panel_name": "Hormones",
        "aliases": ["PRL", "Serum Prolactin"],
        "default_unit": "ng/mL",
        "typical_min": 2.0,
        "typical_max": 18.0,
    },
    {
        "canonical_name": "DHEA-S",
        "panel_name": "Hormones",
        "aliases": ["DHEAS", "Dehydroepiandrosterone Sulfate", "DHEA Sulfate"],
        "default_unit": "µg/dL",
        "typical_min": None,
        "typical_max": None,
    },
    # ── Urinalysis ────────────────────────────────────────────────────────────
    {
        "canonical_name": "Urine Protein",
        "panel_name": "Urinalysis",
        "aliases": ["Protein (Urine)", "Urinary Protein", "Urine Albumin"],
        "default_unit": "mg/dL",
        "typical_min": None,
        "typical_max": None,
    },
    {
        "canonical_name": "Urine Glucose",
        "panel_name": "Urinalysis",
        "aliases": ["Glucose (Urine)", "Urinary Glucose"],
        "default_unit": "mg/dL",
        "typical_min": None,
        "typical_max": None,
    },
    {
        "canonical_name": "Urine Creatinine",
        "panel_name": "Urinalysis",
        "aliases": ["Creatinine (Urine)", "Urinary Creatinine"],
        "default_unit": "mg/dL",
        "typical_min": None,
        "typical_max": None,
    },
    {
        "canonical_name": "Microalbumin",
        "panel_name": "Urinalysis",
        "aliases": ["Urine Microalbumin", "Microalbuminuria", "Albumin-to-Creatinine Ratio"],
        "default_unit": "mg/g",
        "typical_min": None,
        "typical_max": 30.0,
    },
]


async def seed_canonical_metrics(db: AsyncSession) -> None:
    """
    Seeds the canonical_metrics table with standard blood test metric definitions
    if the table is empty.
    """
    result = await db.execute(select(CanonicalMetric).limit(1))
    existing = result.scalar_one_or_none()
    if existing is not None:
        logger.info("canonical_metrics already seeded, skipping.")
        return

    logger.info("Seeding %d canonical metrics...", len(CANONICAL_METRICS_SEED))
    for entry in CANONICAL_METRICS_SEED:
        metric = CanonicalMetric(**entry)
        db.add(metric)

    await db.flush()
    logger.info("Canonical metrics seeded successfully.")
