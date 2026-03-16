import argparse
import pickle
from datetime import datetime, timezone
from pathlib import Path
from typing import Tuple

import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier


def _resolve_project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _load_dataset(csv_path: Path) -> pd.DataFrame:
    if not csv_path.exists():
        raise FileNotFoundError(f"Dataset not found: {csv_path}")
    return pd.read_csv(csv_path)


def _build_training_frame(df: pd.DataFrame, healthy_label: int) -> Tuple[pd.DataFrame, pd.Series]:
    required_columns = {
        "Engine rpm",
        "Lub oil pressure",
        "lub oil temp",
        "Coolant temp",
        "Engine Condition",
    }
    missing = sorted(required_columns - set(df.columns))
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    rpm = pd.to_numeric(df["Engine rpm"], errors="coerce").fillna(0.0)
    oil_pressure_psi = pd.to_numeric(df["Lub oil pressure"], errors="coerce").fillna(0.0) * 14.5038
    lub_oil_temp_c = pd.to_numeric(df["lub oil temp"], errors="coerce").fillna(0.0)
    coolant_temp_c = pd.to_numeric(df["Coolant temp"], errors="coerce").fillna(0.0)

    engine_temp_c = (lub_oil_temp_c + coolant_temp_c) / 2.0
    temp_delta_c = engine_temp_c - coolant_temp_c

    X = pd.DataFrame(
        {
            "rpm": rpm,
            "oil_pressure_psi": oil_pressure_psi,
            "engine_temp_c": engine_temp_c,
            "coolant_temp_c": coolant_temp_c,
            "temp_delta_c": temp_delta_c,
        }
    )

    labels = pd.to_numeric(df["Engine Condition"], errors="coerce").fillna(healthy_label).astype(int)
    y = (labels != healthy_label).astype(int)

    if y.nunique() < 2:
        raise ValueError("Training labels must contain both healthy and failure classes")

    return X, y


def train_model(dataset_path: Path, output_path: Path, healthy_label: int) -> None:
    raw_df = _load_dataset(dataset_path)
    X, y = _build_training_frame(raw_df, healthy_label)

    X_train, X_val, y_train, y_val = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    model = XGBClassifier(
        n_estimators=260,
        max_depth=4,
        learning_rate=0.06,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=42,
        n_jobs=4,
    )
    model.fit(X_train, y_train)

    val_raw_probability = model.predict_proba(X_val)[:, 1]
    calibrator = IsotonicRegression(out_of_bounds="clip")
    calibrator.fit(val_raw_probability, y_val)

    val_calibrated_probability = calibrator.predict(val_raw_probability)
    auc_raw = float(roc_auc_score(y_val, val_raw_probability))
    auc_calibrated = float(roc_auc_score(y_val, val_calibrated_probability))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    bundle = {
        "model": model,
        "calibrator": calibrator,
        "model_name": "xgboost-risk-model-v1",
        "feature_names": list(X.columns),
        "healthy_label": int(healthy_label),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": {
            "validation_auc_raw": auc_raw,
            "validation_auc_calibrated": auc_calibrated,
            "samples": int(len(X)),
            "failure_rate": float(y.mean()),
        },
    }

    with output_path.open("wb") as file_obj:
        pickle.dump(bundle, file_obj)

    print("✅ Risk model trained successfully")
    print(f"   dataset: {dataset_path}")
    print(f"   output : {output_path}")
    print(f"   auc raw: {auc_raw:.4f}")
    print(f"   auc cal: {auc_calibrated:.4f}")


def parse_args() -> argparse.Namespace:
    project_root = _resolve_project_root()
    parser = argparse.ArgumentParser(description="Train calibrated XGBoost risk model")
    parser.add_argument(
        "--dataset",
        default=str(project_root / "engine_data.csv"),
        help="Path to engine_data.csv",
    )
    parser.add_argument(
        "--output",
        default=str(project_root / "app" / "models" / "risk_xgb.pkl"),
        help="Output model bundle path",
    )
    parser.add_argument(
        "--healthy-label",
        type=int,
        default=1,
        help="Label value in Engine Condition column that represents healthy samples",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    train_model(
        dataset_path=Path(args.dataset),
        output_path=Path(args.output),
        healthy_label=args.healthy_label,
    )


if __name__ == "__main__":
    main()
