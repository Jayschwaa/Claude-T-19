/**
 * PSA Location Configuration
 * Supports multiple PSA instances/locations with separate credentials and filters.
 */

export interface PSALocationConfig {
  id: string;
  name: string;
  username: string;
  password: string;
  baseUrl: string;
  schema: string;
  territoryFilter: string | null; // null = all territories for that login
  yearFilter: string;
}

/**
 * Get all configured PSA locations from environment variables.
 * T-19 Pompano is always included if PSA_USERNAME/PSA_PASSWORD are set.
 * Omaha is included if PSA_OMAHA_USERNAME/PSA_OMAHA_PASSWORD are set.
 */
export function getLocationConfigs(): PSALocationConfig[] {
  const configs: PSALocationConfig[] = [];

  // T-19 Pompano (South Florida, schema 1022)
  if (process.env.PSA_USERNAME && process.env.PSA_PASSWORD) {
    configs.push({
      id: 't19',
      name: 'T-19 Pompano',
      username: process.env.PSA_USERNAME,
      password: process.env.PSA_PASSWORD,
      baseUrl: process.env.PSA_BASE_URL || 'https://uwrg.psarcweb.com/PSAWeb',
      schema: process.env.PSA_SCHEMA || '1022',
      territoryFilter: '19',
      yearFilter: '26',
    });
  }

  // Omaha (schema 1520, different PSA account)
  if (process.env.PSA_OMAHA_USERNAME && process.env.PSA_OMAHA_PASSWORD) {
    configs.push({
      id: 'omaha',
      name: 'Omaha',
      username: process.env.PSA_OMAHA_USERNAME,
      password: process.env.PSA_OMAHA_PASSWORD,
      baseUrl:
        process.env.PSA_OMAHA_BASE_URL ||
        process.env.PSA_BASE_URL ||
        'https://uwrg.psarcweb.com/PSAWeb',
      schema: process.env.PSA_OMAHA_SCHEMA || '1520',
      territoryFilter: null, // fetch all territories, narrow later
      yearFilter: '26',
    });
  }

  return configs;
}

/**
 * Get a specific location config by ID.
 */
export function getLocationConfig(id: string): PSALocationConfig | null {
  const configs = getLocationConfigs();
  return configs.find((c) => c.id === id) || null;
}
