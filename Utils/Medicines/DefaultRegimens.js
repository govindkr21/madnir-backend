// Cold-start regimen defaults for common drugs, keyed by lowercased name.
// Used only until a doctor has prescribed the drug themselves — after that,
// their own remembered regimen (DoctorDrugPref) takes over. Values use the
// same vocabulary as the regimen chips: dose / Indian frequency shorthand
// (1-1-1 = morning-noon-night) / "5 days" / "After food" — so they render as
// pre-selected chips in the UI.
const DEFAULT_REGIMENS = {
  "paracetamol": { dose: "500mg", freq: "1-1-1", days: "5 days", when: "After food" },
  "paracetamol 500mg": { dose: "500mg", freq: "1-1-1", days: "5 days", when: "After food" },
  "paracetamol 650mg": { dose: "650mg", freq: "1-1-1", days: "5 days", when: "After food" },
  "dolo 650": { dose: "650mg", freq: "1-1-1", days: "5 days", when: "After food" },
  "crocin": { dose: "500mg", freq: "1-1-1", days: "5 days", when: "After food" },
  "ibuprofen": { dose: "400mg", freq: "1-0-1", days: "5 days", when: "After food" },
  "combiflam": { dose: "", freq: "1-0-1", days: "3 days", when: "After food" },
  "aceclofenac": { dose: "100mg", freq: "1-0-1", days: "5 days", when: "After food" },
  "amoxicillin": { dose: "500mg", freq: "1-1-1", days: "5 days", when: "After food" },
  "augmentin 625": { dose: "625mg", freq: "1-0-1", days: "5 days", when: "After food" },
  "azithromycin": { dose: "500mg", freq: "OD", days: "3 days", when: "Before food" },
  "azithral 500": { dose: "500mg", freq: "OD", days: "3 days", when: "Before food" },
  "cefixime": { dose: "200mg", freq: "1-0-1", days: "5 days", when: "After food" },
  "ciprofloxacin": { dose: "500mg", freq: "1-0-1", days: "5 days", when: "After food" },
  "metronidazole": { dose: "400mg", freq: "1-1-1", days: "5 days", when: "After food" },
  "cetirizine": { dose: "10mg", freq: "0-0-1", days: "5 days", when: "After food" },
  "levocetirizine": { dose: "5mg", freq: "0-0-1", days: "5 days", when: "After food" },
  "montelukast": { dose: "10mg", freq: "0-0-1", days: "10 days", when: "After food" },
  "pantoprazole": { dose: "40mg", freq: "1-0-0", days: "5 days", when: "Before food" },
  "pan 40": { dose: "40mg", freq: "1-0-0", days: "5 days", when: "Before food" },
  "omeprazole": { dose: "20mg", freq: "1-0-0", days: "5 days", when: "Before food" },
  "rabeprazole": { dose: "20mg", freq: "1-0-0", days: "5 days", when: "Before food" },
  "domperidone": { dose: "10mg", freq: "1-1-1", days: "3 days", when: "Before food" },
  "ondansetron": { dose: "4mg", freq: "1-0-1", days: "3 days", when: "Before food" },
  "ors": { dose: "", freq: "SOS", days: "3 days", when: "After food" },
  "metformin": { dose: "500mg", freq: "1-0-1", days: "30 days", when: "After food" },
  "amlodipine": { dose: "5mg", freq: "1-0-0", days: "30 days", when: "After food" },
  "telmisartan": { dose: "40mg", freq: "1-0-0", days: "30 days", when: "After food" },
  "atorvastatin": { dose: "10mg", freq: "0-0-1", days: "30 days", when: "After food" },
  "vitamin d3": { dose: "", freq: "Once weekly", days: "8 weeks", when: "After food" },
};

module.exports = { DEFAULT_REGIMENS };
