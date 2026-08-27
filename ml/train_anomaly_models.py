import os
import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from sklearn.ensemble import IsolationForest, RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    auc,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_curve,
)
from sklearn.preprocessing import StandardScaler


def main():
    print("=" * 75)
    print("  AERO-PISTON ENGINE DIGITAL TWIN - MODEL TRAINING & SERIALIZATION (M4)")
    print("=" * 75)

    # 1. Load Dataset
    csv_path = os.path.join("data", "engine_telemetry_dataset.csv")
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Dataset not found at {csv_path}. Run generate_dataset.py first.")

    print(f"\n[1] Loading Telemetry Dataset from: {csv_path}")
    df = pd.read_csv(csv_path)

    # 2. Define Input Feature Channels & Target
    env_inputs = ["altitude_ft", "throttle", "air_density"]
    sensor_outputs = [
        "rpm",
        "torque_net_nm",
        "power_kw",
        "fuel_flow_l_hr",
        "egt_c",
        "cht_c",
        "oil_temp_c",
        "oil_pressure_bar",
        "vibration_g",
    ]
    features = env_inputs + sensor_outputs
    target = "health_label"  # 0 = Healthy, 1 = Degraded / Anomaly

    print(f"\n[2] Feature Engineering & Data Leakage Protection:")
    print(f"    Environment Inputs:  {env_inputs}")
    print(f"    Sensor Outputs:      {sensor_outputs}")
    print(f"    Target Column:       '{target}' (0 = Healthy, 1 = Degraded)")

    # 3. Group Train/Test Split by run_id (80% train runs, 20% test runs)
    unique_runs = df["run_id"].unique()
    np.random.seed(42)
    np.random.shuffle(unique_runs)

    num_train = int(len(unique_runs) * 0.8)
    train_runs = unique_runs[:num_train]
    test_runs = unique_runs[num_train:]

    train_df = df[df["run_id"].isin(train_runs)].copy()
    test_df = df[df["run_id"].isin(test_runs)].copy()

    print(f"\n[3] Group Train/Test Split by Run ID:")
    print(f"    Training Set: {len(train_runs)} runs ({len(train_df):,} samples)")
    print(f"    Testing Set:  {len(test_runs)} runs ({len(test_df):,} samples)")

    train_healthy_df = train_df[train_df[target] == 0].copy()

    # 4. Train Digital Twin Physics Estimator (Healthy Reference Model)
    print("\n[4] Training Digital Twin Physics Estimator (RandomForestRegressor)...")
    physics_estimator = RandomForestRegressor(
        n_estimators=50, max_depth=12, random_state=42, n_jobs=-1
    )
    physics_estimator.fit(train_healthy_df[env_inputs], train_healthy_df[sensor_outputs])

    def compute_residuals(dataframe):
        predicted_healthy = physics_estimator.predict(dataframe[env_inputs])
        actual_sensors = dataframe[sensor_outputs].values
        return np.abs(actual_sensors - predicted_healthy)

    R_train = compute_residuals(train_df)
    R_test = compute_residuals(test_df)

    y_train = train_df[target].values
    y_test = test_df[target].values

    # 5. Train Model A: Direct Unsupervised Isolation Forest
    print("\n[5] Training Model A: Unsupervised Isolation Forest (Raw Telemetry)...")
    scaler_raw = StandardScaler()
    X_train_raw = scaler_raw.fit_transform(train_df[features])
    X_test_raw = scaler_raw.transform(test_df[features])

    iso_raw = IsolationForest(n_estimators=100, contamination=0.20, random_state=42, n_jobs=-1)
    iso_raw.fit(X_train_raw)

    iso_raw_scores = -iso_raw.decision_function(X_test_raw)
    y_pred_raw = (iso_raw.predict(X_test_raw) == -1).astype(int)

    raw_prec = precision_score(y_test, y_pred_raw)
    raw_rec = recall_score(y_test, y_pred_raw)
    raw_f1 = f1_score(y_test, y_pred_raw)
    fpr_raw, tpr_raw, _ = roc_curve(y_test, iso_raw_scores)
    raw_auc = auc(fpr_raw, tpr_raw)

    # 6. Train Model B: Physics-Informed Digital Twin Classifier
    print("\n[6] Training Model B: Physics-Informed Digital Twin Classifier...")
    X_train_augmented = np.hstack([train_df[features].values, R_train])
    X_test_augmented = np.hstack([test_df[features].values, R_test])

    scaler_aug = StandardScaler()
    X_train_aug_scaled = scaler_aug.fit_transform(X_train_augmented)
    X_test_aug_scaled = scaler_aug.transform(X_test_augmented)

    anomaly_classifier = RandomForestClassifier(
        n_estimators=100, max_depth=12, random_state=42, n_jobs=-1
    )
    anomaly_classifier.fit(X_train_aug_scaled, y_train)

    y_probs_twin = anomaly_classifier.predict_proba(X_test_aug_scaled)[:, 1]
    y_pred_twin = (y_probs_twin >= 0.5).astype(int)

    twin_prec = precision_score(y_test, y_pred_twin)
    twin_rec = recall_score(y_test, y_pred_twin)
    twin_f1 = f1_score(y_test, y_pred_twin)
    fpr_twin, tpr_twin, _ = roc_curve(y_test, y_probs_twin)
    twin_auc = auc(fpr_twin, tpr_twin)

    cm_twin = confusion_matrix(y_test, y_pred_twin)

    # 7. Summary Benchmark Report
    print("\n[7] Anomaly Detection Benchmark Results:")
    print("-" * 80)
    print(f"{'Model Architecture':<36}{'Precision':<12}{'Recall':<12}{'F1-Score':<12}{'ROC-AUC':<10}")
    print("-" * 80)
    print(f"{'Direct Isolation Forest (Raw)':<36}{raw_prec:<12.4f}{raw_rec:<12.4f}{raw_f1:<12.4f}{raw_auc:<10.4f}")
    print(f"{'Digital Twin Anomaly Classifier (M4)':<36}{twin_prec:<12.4f}{twin_rec:<12.4f}{twin_f1:<12.4f}{twin_auc:<10.4f}")
    print("-" * 80)

    print(f"\n    Detection Recall by Injector Health Efficiency:")
    print("    " + "-" * 60)
    print(f"    {'Injector Efficiency':<25}{'Total Samples':<18}{'Detection Rate (Recall)':<20}")
    print("    " + "-" * 60)
    for inj_eff in [0.95, 0.90, 0.85, 0.80]:
        sub_mask = test_df["injector_efficiency"] == inj_eff
        sub_y_true = y_test[sub_mask]
        sub_y_pred = y_pred_twin[sub_mask]
        sub_recall = recall_score(sub_y_true, sub_y_pred) if len(sub_y_true) > 0 else 0.0
        print(f"    {int(inj_eff*100)}% Injector Efficiency     {len(sub_y_true):<18,}{sub_recall*100:<20.2f}%")
    print("    " + "-" * 60)

    # 8. Model Serialization
    models_dir = os.path.join("ml", "models")
    os.makedirs(models_dir, exist_ok=True)

    estimator_path = os.path.join(models_dir, "physics_estimator.joblib")
    classifier_path = os.path.join(models_dir, "anomaly_classifier.joblib")
    scaler_path = os.path.join(models_dir, "scaler.joblib")

    joblib.dump(physics_estimator, estimator_path)
    joblib.dump(anomaly_classifier, classifier_path)
    joblib.dump(scaler_aug, scaler_path)

    print(f"\n[8] Serializing Trained Models to {models_dir}:")
    print(f"    - Physics Estimator:   {estimator_path}")
    print(f"    - Anomaly Classifier: {classifier_path}")
    print(f"    - Feature Scaler:     {scaler_path}")

    # 9. Plotting Results
    plots_dir = "plots"
    os.makedirs(plots_dir, exist_ok=True)
    
    fig, axs = plt.subplots(2, 2, figsize=(13, 9))
    fig.suptitle("M4: Aero-Piston Digital Twin Anomaly Detection Engine", fontsize=14, fontweight="bold")

    ax1 = axs[0, 0]
    disp = ConfusionMatrixDisplay(confusion_matrix=cm_twin, display_labels=["Healthy", "Degraded"])
    disp.plot(ax=ax1, cmap="Blues", values_format=",d", colorbar=False)
    ax1.set_title("1. Confusion Matrix (Digital Twin Classifier)")

    ax2 = axs[0, 1]
    ax2.plot(fpr_raw, tpr_raw, color="crimson", linestyle="--", linewidth=2, label=f"Direct Isolation Forest (AUC = {raw_auc:.3f})")
    ax2.plot(fpr_twin, tpr_twin, color="navy", linewidth=2.5, label=f"Digital Twin Classifier (AUC = {twin_auc:.3f})")
    ax2.plot([0, 1], [0, 1], color="gray", linestyle=":")
    ax2.set_xlabel("False Positive Rate")
    ax2.set_ylabel("True Positive Rate")
    ax2.set_title("2. ROC Curve Comparison")
    ax2.legend(loc="lower right")
    ax2.grid(True, linestyle=":", alpha=0.6)

    ax3 = axs[1, 0]
    severities = ["95%", "90%", "85%", "80%"]
    recalls = []
    for inj_eff in [0.95, 0.90, 0.85, 0.80]:
        sub_mask = test_df["injector_efficiency"] == inj_eff
        sub_y_true = y_test[sub_mask]
        sub_y_pred = y_pred_twin[sub_mask]
        recalls.append(recall_score(sub_y_true, sub_y_pred) * 100 if len(sub_y_true) > 0 else 0)

    bars = ax3.bar(severities, recalls, color=["#FFC107", "#FF9800", "#F44336", "#D32F2F"])
    ax3.set_xlabel("Injector Health Efficiency")
    ax3.set_ylabel("Fault Detection Rate / Recall (%)")
    ax3.set_title("3. Detection Rate vs Fault Severity")
    ax3.set_ylim(0, 110)
    for bar in bars:
        height = bar.get_height()
        ax3.annotate(f"{height:.1f}%", xy=(bar.get_x() + bar.get_width() / 2, height),
                    xytext=(0, 3), textcoords="offset points", ha="center", va="bottom")
    ax3.grid(True, linestyle=":", alpha=0.6, axis="y")

    ax4 = axs[1, 1]
    sample_degraded_run_id = test_df[test_df[target] == 1]["run_id"].iloc[0]
    sample_run = test_df[test_df["run_id"] == sample_degraded_run_id].sort_values("time_s")

    sample_R = compute_residuals(sample_run)
    sample_X_aug = np.hstack([sample_run[features].values, sample_R])
    sample_X_scaled = scaler_aug.transform(sample_X_aug)
    sample_probs = anomaly_classifier.predict_proba(sample_X_scaled)[:, 1]

    ax4.plot(sample_run["time_s"], sample_probs * 100, color="crimson", linewidth=2, label="Anomaly Probability (%)")
    ax4.axhline(y=50.0, color="black", linestyle="--", label="Decision Threshold (50%)")
    ax4.set_xlabel("Simulation Time (s)")
    ax4.set_ylabel("Anomaly Probability (%)", color="crimson")
    ax4.set_title(f"4. Anomaly Detection Probability (Run {sample_degraded_run_id})")
    ax4.legend(loc="upper right")
    ax4.grid(True, linestyle=":", alpha=0.6)

    plt.tight_layout()
    plot_path = os.path.join(plots_dir, "m4_anomaly_detection_results.png")
    plt.savefig(plot_path, dpi=300)
    plt.close()

    print(f"\n[SUCCESS] Model training and evaluation complete! Plot saved to: {plot_path}")


if __name__ == "__main__":
    main()

