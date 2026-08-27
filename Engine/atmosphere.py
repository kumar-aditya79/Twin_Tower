import math


# ISA constants
SEA_LEVEL_PRESSURE = 101325.0      # Pa
SEA_LEVEL_TEMPERATURE = 288.15     # K
TEMPERATURE_LAPSE_RATE = 0.0065    # K/m
GAS_CONSTANT_AIR = 287.05          # J/(kg·K)
GRAVITY = 9.80665                  # m/s²


def atmosphere(altitude_ft, temperature_offset_c=0.0):
    """
    Calculate atmospheric pressure and air density.

    Parameters
    ----------
    altitude_ft : float
        Altitude above sea level in feet.

    temperature_offset_c : float
        Temperature deviation from ISA standard temperature in °C.

    Returns
    -------
    dict
        Contains altitude, temperature, pressure and air density.
    """

    # Convert altitude from feet to metres
    altitude_m = altitude_ft * 0.3048

    # Standard ISA temperature
    temperature = (
        SEA_LEVEL_TEMPERATURE
        - TEMPERATURE_LAPSE_RATE * altitude_m
        + temperature_offset_c
    )

    # Pressure using barometric formula
    pressure = SEA_LEVEL_PRESSURE * (
        temperature / SEA_LEVEL_TEMPERATURE
    ) ** (
        GRAVITY / (GAS_CONSTANT_AIR * TEMPERATURE_LAPSE_RATE)
    )

    # Ideal gas law
    density = pressure / (GAS_CONSTANT_AIR * temperature)

    return {
        "altitude_ft": altitude_ft,
        "temperature_k": temperature,
        "temperature_c": temperature - 273.15,
        "pressure_pa": pressure,
        "density_kg_m3": density,
    }


if __name__ == "__main__":

    test_altitudes = [0, 10000, 20000]

    print("ISA Atmosphere Model")
    print("-" * 60)

    for altitude in test_altitudes:

        result = atmosphere(altitude)

        print(f"\nAltitude: {altitude:,.0f} ft")
        print(f"Temperature: {result['temperature_c']:.2f} °C")
        print(f"Pressure:    {result['pressure_pa']:.2f} Pa")
        print(f"Density:     {result['density_kg_m3']:.4f} kg/m³")