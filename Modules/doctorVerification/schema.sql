-- Doctor verification cache, populated from NMC IMR lookups.
-- The (registration_number, smc_id) composite key is the natural identity:
-- two doctors can share a registration_number across different SMCs.

CREATE TABLE IF NOT EXISTS doctor_verifications (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  doctor_name             VARCHAR(255)        NOT NULL,
  registration_number     VARCHAR(64)         NOT NULL,
  state_medical_council   VARCHAR(255)        NOT NULL,
  smc_id                  VARCHAR(32)         NOT NULL,
  qualification           VARCHAR(512)        NULL,
  university              VARCHAR(255)        NULL,
  year_of_registration    SMALLINT UNSIGNED   NULL,
  raw_payload             JSON                NULL,
  last_verified_at        TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP
                                              ON UPDATE CURRENT_TIMESTAMP,
  created_at              TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_reg_smc (registration_number, smc_id),
  KEY idx_doctor_name (doctor_name),
  KEY idx_last_verified (last_verified_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
