export interface NmcSearchRequest {
  registrationNo: string;
  smcId: string;
  pageNo?: number;
  pageSize?: number;
}

export interface NmcDoctorRecord {
  doctorName: string;
  registrationNumber: string;
  stateMedicalCouncil: string;
  smcId: string;
  qualification: string | null;
  university: string | null;
  yearOfRegistration: number | null;
  raw: Record<string, unknown>;
}

export type VerificationResponse =
  | {
      success: true;
      data: NmcDoctorRecord;
      message: "Doctor verified";
      cached: boolean;
    }
  | {
      success: false;
      data: null;
      message: string;
    };
