import requirementsData from "@/data/requirements.json";

export type Course = {
  code: string;
  title: string;
  units: number;
  category?: "major";
};

export type TargetSchool = {
  school: string;
  requiredCourses: Course[];
  geRequirements: Course[];
};

export type Major = {
  name: string;
  targetSchools: TargetSchool[];
};

export type RequirementsData = {
  majors: Major[];
};

export const requirements = requirementsData as RequirementsData;

export function findMajor(majorName: string | null) {
  return requirements.majors.find((major) => major.name === majorName);
}

export function findTargetSchool(major: Major | undefined, schoolName: string | null) {
  return major?.targetSchools.find((targetSchool) => targetSchool.school === schoolName);
}
