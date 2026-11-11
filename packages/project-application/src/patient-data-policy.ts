const PROHIBITED_PATTERNS = [
  /患者姓名/iu,
  /患者手机号/iu,
  /身份证号/iu,
  /住院号/iu,
  /病历/iu,
  /检查报告/iu,
  /受试者明细/iu,
  /\bCRF\b/iu,
  /\bEDC\b/iu,
];

export function containsProhibitedPatientData(value: string): boolean {
  return PROHIBITED_PATTERNS.some((pattern) => pattern.test(value));
}
