import requirementsData from "@/data/requirements.json";

export type Course = {
  code: string;
  title: string;
  units: number;
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

type CourseCatalogEntry = {
  title: string;
  units: number;
};

type RawTargetSchool = {
  school: string;
  requiredCourseCodes: string[];
  geRequirementCodes: string[];
};

type RawMajor = {
  name: string;
  targetSchools: RawTargetSchool[];
};

type RawRequirementsData = {
  courseCatalog: Record<string, CourseCatalogEntry>;
  majors: RawMajor[];
};

const rawRequirements = requirementsData as RawRequirementsData;

function hydrateCourse(code: string): Course {
  const course = rawRequirements.courseCatalog[code];

  if (!course) {
    throw new Error(`Missing course catalog entry for ${code}`);
  }

  return {
    code,
    title: course.title,
    units: course.units,
  };
}

export const requirements: RequirementsData = {
  majors: rawRequirements.majors.map((major) => ({
    name: major.name,
    targetSchools: major.targetSchools.map((targetSchool) => ({
      school: targetSchool.school,
      requiredCourses: targetSchool.requiredCourseCodes.map(hydrateCourse),
      geRequirements: targetSchool.geRequirementCodes.map(hydrateCourse),
    })),
  })),
};

export function findMajor(majorName: string | null) {
  return requirements.majors.find((major) => major.name === majorName);
}

export function findTargetSchool(major: Major | undefined, schoolName: string | null) {
  return major?.targetSchools.find((targetSchool) => targetSchool.school === schoolName);
}
