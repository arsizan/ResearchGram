import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// 9 Nov 2026: AcademicOrbit rename
const DEFAULT_PASSWORD = "AcademicOrbit@12345";

const demoProfiles = [
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "nusrat.jahan@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Nusrat Jahan",
    department: "Computer Science and Engineering",
    user_role: "student",
    academic_level: "Undergraduate",
    batch: "2020",
    session: "2019-20",
    graduation_year: 2025,
    current_position: "Final Year Student",
    company_or_institution: "Pabna University of Science and Technology",
    research_area: "Artificial Intelligence, Machine Learning",
    expertise: "Python, TensorFlow, Data Analysis",
    skills: "Python, Machine Learning, React, SQL, Research Writing",
    interests: "AI for agriculture, computer vision, academic collaboration",
    bio: "Final year CSE student interested in applying machine learning to solve local agricultural and social problems.",
    mentorship_available: false,
    office_hours: "",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "rakib.hasan@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Rakib Hasan",
    department: "Information and Communication Engineering",
    user_role: "student",
    academic_level: "Undergraduate",
    batch: "2021",
    session: "2020-21",
    graduation_year: 2026,
    current_position: "Undergraduate Researcher",
    company_or_institution: "Pabna University of Science and Technology",
    research_area: "IoT, Wireless Sensor Networks",
    expertise: "Arduino, ESP32, Sensor Networks",
    skills: "IoT, C++, Arduino, Networking, Embedded Systems",
    interests: "Smart campus, environmental monitoring, low-cost IoT systems",
    bio: "Undergraduate student working on IoT-based environmental monitoring and smart agriculture systems.",
    mentorship_available: false,
    office_hours: "",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "farzana.akter@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Farzana Akter",
    department: "Physics",
    user_role: "student",
    academic_level: "Masters",
    batch: "2019",
    session: "2018-19",
    graduation_year: 2024,
    current_position: "MSc Research Student",
    company_or_institution: "Pabna University of Science and Technology",
    research_area: "Renewable Energy, Solar Materials",
    expertise: "Solar Cell Simulation, Material Characterization",
    skills: "MATLAB, Origin, LaTeX, Data Visualization",
    interests: "Solar energy, sustainable materials, energy storage",
    bio: "Research student focusing on renewable energy materials and simulation-based analysis of solar cell performance.",
    mentorship_available: false,
    office_hours: "",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "tanvir.ahmed@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Tanvir Ahmed",
    department: "Civil Engineering",
    user_role: "student",
    academic_level: "Undergraduate",
    batch: "2020",
    session: "2019-20",
    graduation_year: 2025,
    current_position: "Final Year Student",
    company_or_institution: "Pabna University of Science and Technology",
    research_area: "Structural Engineering, Concrete Technology",
    expertise: "ETABS, AutoCAD, Concrete Mix Design",
    skills: "AutoCAD, ETABS, Surveying, Technical Report Writing",
    interests: "Sustainable concrete, low-cost housing, structural safety",
    bio: "Civil engineering student interested in sustainable construction materials and structural safety assessment.",
    mentorship_available: false,
    office_hours: "",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "mehedi.hasan@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Mehedi Hasan",
    department: "Mathematics",
    user_role: "student",
    academic_level: "Masters",
    batch: "2018",
    session: "2017-18",
    graduation_year: 2024,
    current_position: "Graduate Research Student",
    company_or_institution: "Pabna University of Science and Technology",
    research_area: "Numerical Analysis, Optimization",
    expertise: "MATLAB, Numerical Methods, Linear Algebra",
    skills: "MATLAB, Python, Numerical Methods, Optimization",
    interests: "Optimization algorithms, simulation, applied mathematics",
    bio: "Graduate student working on numerical methods and optimization problems for engineering applications.",
    mentorship_available: false,
    office_hours: "",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "shuvo.roy@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Shuvo Roy",
    department: "Electrical and Electronic Engineering",
    user_role: "student",
    academic_level: "Undergraduate",
    batch: "2021",
    session: "2020-21",
    graduation_year: 2026,
    current_position: "EEE Student",
    company_or_institution: "Pabna University of Science and Technology",
    research_area: "Power Systems, Smart Grid",
    expertise: "Proteus, MATLAB Simulink, Circuit Design",
    skills: "Circuit Design, MATLAB, Proteus, Power Systems",
    interests: "Smart grid, renewable power, campus energy monitoring",
    bio: "EEE student interested in renewable power systems and smart monitoring for campus energy management.",
    mentorship_available: false,
    office_hours: "",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "dr.sadia.islam@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Dr. Sadia Islam",
    department: "Computer Science and Engineering",
    user_role: "faculty",
    academic_level: "PhD",
    batch: "",
    session: "",
    graduation_year: null,
    current_position: "Assistant Professor",
    company_or_institution: "Pabna University of Science and Technology",
    research_area: "Artificial Intelligence, Natural Language Processing",
    expertise: "Machine Learning, NLP, Research Supervision",
    skills: "NLP, Deep Learning, Python, Research Methodology",
    interests: "Bangla NLP, explainable AI, student research supervision",
    bio: "Faculty member supervising research in Bangla NLP, machine learning, and AI-based academic tools.",
    mentorship_available: true,
    office_hours: "Sunday and Tuesday, 11:00 AM - 1:00 PM",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "dr.nazmul.karim@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Dr. Nazmul Karim",
    department: "Physics",
    user_role: "faculty",
    academic_level: "PhD",
    batch: "",
    session: "",
    graduation_year: null,
    current_position: "Associate Professor",
    company_or_institution: "Pabna University of Science and Technology",
    research_area: "Renewable Energy, Nanomaterials",
    expertise: "Solar Materials, Thin Film, Energy Devices",
    skills: "Material Science, Research Design, Data Analysis",
    interests: "Solar cells, nanomaterials, sustainable energy",
    bio: "Researcher and faculty mentor working on renewable energy materials and thin-film based solar technologies.",
    mentorship_available: true,
    office_hours: "Monday and Wednesday, 10:00 AM - 12:00 PM",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "prof.mahmud.hasan@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Prof. Mahmud Hasan",
    department: "Business Administration",
    user_role: "faculty",
    academic_level: "PhD",
    batch: "",
    session: "",
    graduation_year: null,
    current_position: "Professor",
    company_or_institution: "Pabna University of Science and Technology",
    research_area: "Entrepreneurship, Innovation Management",
    expertise: "Business Research, Survey Design, SPSS",
    skills: "SPSS, Research Methodology, Academic Writing, Survey Analysis",
    interests: "Student entrepreneurship, digital business, innovation ecosystem",
    bio: "Faculty mentor interested in entrepreneurship research, innovation management, and interdisciplinary student projects.",
    mentorship_available: true,
    office_hours: "Thursday, 2:00 PM - 4:00 PM",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "ayesha.rahman@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Ayesha Rahman",
    department: "Computer Science and Engineering",
    user_role: "alumni",
    academic_level: "Graduate",
    batch: "2016",
    session: "2015-16",
    graduation_year: 2021,
    current_position: "Machine Learning Engineer",
    company_or_institution: "Dhaka AI Lab",
    research_area: "Computer Vision, Applied AI",
    expertise: "Computer Vision, Model Deployment, MLOps",
    skills: "Python, PyTorch, FastAPI, Docker, MLOps",
    interests: "AI product development, research mentoring, computer vision",
    bio: "PUST alumna working as a machine learning engineer. Interested in mentoring students on applied AI projects.",
    mentorship_available: true,
    office_hours: "Friday evening by appointment",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "arif.chowdhury@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Arif Chowdhury",
    department: "Statistics",
    user_role: "alumni",
    academic_level: "Graduate",
    batch: "2015",
    session: "2014-15",
    graduation_year: 2020,
    current_position: "Data Analyst",
    company_or_institution: "Insight Analytics Bangladesh",
    research_area: "Data Science, Public Health Analytics",
    expertise: "Data Cleaning, Dashboard, Statistical Modeling",
    skills: "R, Python, SQL, Power BI, SPSS",
    interests: "Public health data, visualization, predictive analytics",
    bio: "PUST alumnus working in data analytics. Interested in collaborative projects involving health and social datasets.",
    mentorship_available: true,
    office_hours: "Saturday, 8:00 PM - 10:00 PM",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    email: "tahmid.rahman@academicorbit.test",
    password: DEFAULT_PASSWORD,
    full_name: "Tahmid Rahman",
    department: "Public Health",
    user_role: "researcher",
    academic_level: "Graduate",
    batch: "2017",
    session: "2016-17",
    graduation_year: 2022,
    current_position: "Research Assistant",
    company_or_institution: "Community Health Research Center",
    research_area: "Public Health, Epidemiology",
    expertise: "Survey Research, Field Data Collection, Epidemiology",
    skills: "Survey Design, KoboToolbox, SPSS, Report Writing",
    interests: "Dengue prediction, community health, public awareness",
    bio: "Research assistant working on public health projects, field surveys, and disease prediction models.",
    mentorship_available: false,
    office_hours: "",
  },
];

const demoPosts = [
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "nusrat.jahan@academicorbit.test",
    title: "AI-Based Rice Leaf Disease Detection Using Mobile Images",
    content_category: "article",
    post_type: "research_note",
    abstract:
      "This project proposes a lightweight computer vision model to detect common rice leaf diseases from mobile phone images.",
    content:
      "I am planning to build a rice leaf disease detection system using image classification. The idea is to collect rice leaf images from local fields, train a CNN model, and make the model lightweight enough for mobile or web use. I am looking for collaborators who can help with dataset collection, model training, and agricultural validation.",
    keywords: "AI, computer vision, agriculture, rice disease, CNN",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "rakib.hasan@academicorbit.test",
    title: "IoT-Based Smart Irrigation System for Small Farmers",
    content_category: "article",
    post_type: "research_note",
    abstract:
      "A low-cost IoT irrigation system that monitors soil moisture and automates water supply for small agricultural plots.",
    content:
      "The system will use soil moisture sensors, ESP32, and a simple web dashboard to monitor field condition. The main goal is to reduce water waste and support small farmers with an affordable smart irrigation solution.",
    keywords: "IoT, agriculture, ESP32, smart irrigation, sensors",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "dr.sadia.islam@academicorbit.test",
    title: "Bangla NLP Dataset Preparation for Academic Sentiment Analysis",
    content_category: "research_paper",
    post_type: "paper_draft",
    abstract:
      "This work focuses on building a cleaned Bangla sentiment dataset from student feedback and public comments.",
    content:
      "Bangla NLP research is growing, but domain-specific datasets are still limited. This study discusses data cleaning, annotation strategy, class balancing, and baseline models for sentiment classification. Students interested in Bangla NLP may request access to the full paper and dataset notes.",
    keywords: "Bangla NLP, sentiment analysis, dataset, machine learning",
    visibility_mode: "abstract_only",
    full_paper_access_mode: "request_required",
    allow_full_paper_request: true,
    doi: "10.1234/rg.bangla.nlp.2026",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "farzana.akter@academicorbit.test",
    title: "Simulation Study of Perovskite Solar Cell Efficiency",
    content_category: "research_paper",
    post_type: "paper_draft",
    abstract:
      "A simulation-based analysis of perovskite solar cell efficiency under different absorber layer thicknesses.",
    content:
      "The study compares different absorber layer thickness values and observes how they affect open-circuit voltage, short-circuit current, and overall efficiency. I am interested in discussing simulation tools and experimental validation possibilities.",
    keywords: "solar cell, perovskite, renewable energy, simulation, physics",
    visibility_mode: "abstract_only",
    full_paper_access_mode: "request_required",
    allow_full_paper_request: true,
    doi: "10.1234/rg.solar.cell.2026",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "tanvir.ahmed@academicorbit.test",
    title: "Use of Recycled Brick Aggregate in Lightweight Concrete",
    content_category: "article",
    post_type: "research_note",
    abstract:
      "A sustainable concrete study using recycled brick aggregate for low-cost construction materials.",
    content:
      "This research idea investigates whether recycled brick aggregate can be used to produce lightweight concrete with acceptable compressive strength. The study may include mix design, curing condition, strength testing, and comparison with conventional concrete.",
    keywords: "civil engineering, concrete, recycled aggregate, sustainability",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "mehedi.hasan@academicorbit.test",
    title: "Comparative Study of Newton-Raphson and Secant Method",
    content_category: "research_paper",
    post_type: "paper_draft",
    abstract:
      "A numerical comparison of convergence behavior between Newton-Raphson and Secant methods.",
    content:
      "The paper compares iteration count, error behavior, and convergence reliability for several nonlinear equations. It may be useful for students studying numerical analysis and computational mathematics.",
    keywords: "numerical methods, Newton-Raphson, Secant method, mathematics",
    visibility_mode: "abstract_only",
    full_paper_access_mode: "request_required",
    allow_full_paper_request: true,
    doi: "10.1234/rg.numerical.methods.2026",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "shuvo.roy@academicorbit.test",
    title: "Smart Energy Monitoring System for University Buildings",
    content_category: "article",
    post_type: "research_note",
    abstract:
      "A smart meter-based system to monitor energy consumption across academic buildings.",
    content:
      "The proposed system will collect energy usage data from university buildings and show consumption trends through a dashboard. It can help identify unnecessary electricity usage and support energy-saving decisions.",
    keywords: "smart grid, energy monitoring, EEE, IoT, dashboard",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "ayesha.rahman@academicorbit.test",
    title: "Deploying Machine Learning Models for Student Projects",
    content_category: "article",
    post_type: "research_note",
    abstract:
      "A practical guide for deploying small machine learning models using FastAPI and cloud platforms.",
    content:
      "Many student research projects stop after model training. This resource explains how to expose a trained model through an API, test it locally, and prepare it for simple deployment. It is useful for students working on AI-based final year projects.",
    keywords: "machine learning, deployment, FastAPI, MLOps, student project",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "arif.chowdhury@academicorbit.test",
    title: "Public Health Survey Data Cleaning Checklist",
    content_category: "article",
    post_type: "research_note",
    abstract:
      "A checklist for cleaning survey data before statistical analysis.",
    content:
      "This resource includes practical steps for checking missing values, duplicate entries, inconsistent categories, outliers, and coding errors in survey datasets. It is suitable for public health and social science research.",
    keywords: "data cleaning, public health, survey, SPSS, research methods",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "tahmid.rahman@academicorbit.test",
    title: "Dengue Outbreak Prediction Using Weather and Case Data",
    content_category: "article",
    post_type: "research_note",
    abstract:
      "A predictive model for dengue outbreak risk using rainfall, temperature, humidity, and previous case data.",
    content:
      "The project aims to combine weather data and reported dengue case data to predict outbreak risk. I am looking for collaborators interested in public health, data science, and visualization.",
    keywords: "dengue, public health, prediction, machine learning, weather data",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "prof.mahmud.hasan@academicorbit.test",
    title: "Student Entrepreneurship Intention in Public Universities",
    content_category: "research_paper",
    post_type: "paper_draft",
    abstract:
      "A survey-based study on factors influencing entrepreneurship intention among public university students.",
    content:
      "The study explores how family background, perceived risk, digital skills, and institutional support affect student entrepreneurship intention. This can be extended as an interdisciplinary project with business and data analysis students.",
    keywords: "entrepreneurship, survey research, business, SPSS, innovation",
    visibility_mode: "abstract_only",
    full_paper_access_mode: "request_required",
    allow_full_paper_request: true,
    doi: "10.1234/rg.entrepreneurship.2026",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "dr.nazmul.karim@academicorbit.test",
    title: "Nanomaterials for Low-Cost Solar Energy Applications",
    content_category: "research_paper",
    post_type: "paper_draft",
    abstract:
      "A review-style academic note on nanomaterials used in affordable solar energy devices.",
    content:
      "This post summarizes the role of nanomaterials in improving solar energy conversion and storage. Students interested in renewable energy research may use this as a starting point for literature review.",
    keywords: "nanomaterials, solar energy, renewable energy, physics",
    visibility_mode: "abstract_only",
    full_paper_access_mode: "request_required",
    allow_full_paper_request: true,
    doi: "10.1234/rg.nanomaterials.2026",
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "dr.sadia.islam@academicorbit.test",
    title: "Research Writing Resource: IEEE Paper Structure",
    content_category: "article",
    post_type: "research_note",
    abstract:
      "A beginner-friendly IEEE-style writing structure for students preparing conference papers.",
    content:
      "This resource explains the basic structure of an IEEE-style research paper: title, abstract, introduction, literature review, methodology, result, discussion, conclusion, and references. Students can use it as a checklist before preparing a paper draft.",
    keywords: "IEEE, research writing, paper template, academic writing",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "prof.mahmud.hasan@academicorbit.test",
    title: "Survey Questionnaire Design Guide for Academic Research",
    content_category: "article",
    post_type: "research_note",
    abstract:
      "A guide for preparing clear academic survey questionnaires.",
    content:
      "This resource covers question wording, Likert scale design, pilot testing, and avoiding biased questions in academic surveys. It is useful for students working on business, social science, education, and public health research.",
    keywords: "survey, questionnaire, research methodology, SPSS",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "arif.chowdhury@academicorbit.test",
    title: "Sample Public Health Dataset Structure",
    content_category: "dataset",
    post_type: "dataset",
    abstract:
      "A small dummy dataset structure for public health analysis practice.",
    content:
      "This dataset format can be used to practice cleaning, visualization, and basic statistical analysis for public health research. Suggested variables include age, gender, location, symptom duration, diagnosis status, and weather condition.",
    keywords: "dataset, public health, statistics, data analysis",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
  {
    // 9 Nov 2026: AcademicOrbit rename
    authorEmail: "ayesha.rahman@academicorbit.test",
    title: "Machine Learning Project Checklist for Final Year Students",
    content_category: "article",
    post_type: "research_note",
    abstract:
      "A checklist for planning and completing machine learning research projects.",
    content:
      "The checklist includes problem definition, dataset source, preprocessing, model selection, evaluation metrics, result interpretation, and deployment planning. It is designed for students who want to turn a model into a complete research project.",
    keywords: "machine learning, checklist, AI project, final year project",
    visibility_mode: "public",
    full_paper_access_mode: "public",
    allow_full_paper_request: false,
  },
];

function normalizeContentItem(item) {
  let contentCategory = item.content_category;
  let postType = item.post_type;
  let visibilityMode = item.visibility_mode || "public";
  let fullPaperAccessMode = item.full_paper_access_mode || "public";

  if (contentCategory === "research_idea") {
    contentCategory = "article";
  }

  if (contentCategory === "resource") {
    contentCategory = "article";
  }

  if (postType === "research") {
    postType = "research_note";
  }

  if (postType === "paper") {
    postType = "paper_draft";
  }

  if (fullPaperAccessMode === "request") {
    fullPaperAccessMode = "request_required";
  }

  if (fullPaperAccessMode === "open") {
    fullPaperAccessMode = "public";
  }

  const allowedCategories = new Set([
    "general_post",
    "research_paper",
    "article",
    "dataset",
    "presentation",
    "code_project",
    "question",
    "announcement",
  ]);

  const allowedPostTypes = new Set([
    "research_note",
    "paper_draft",
    "published_paper",
    "dataset",
    "presentation",
    "code_project",
    "question",
    "announcement",
  ]);

  const allowedVisibilityModes = new Set([
    "public",
    "abstract_only",
    "private",
  ]);

  const allowedFullPaperModes = new Set([
    "public",
    "request_required",
    "private",
  ]);

  if (!allowedCategories.has(contentCategory)) {
    contentCategory = "general_post";
  }

  if (!allowedPostTypes.has(postType)) {
    postType = "research_note";
  }

  if (!allowedVisibilityModes.has(visibilityMode)) {
    visibilityMode = "public";
  }

  if (!allowedFullPaperModes.has(fullPaperAccessMode)) {
    fullPaperAccessMode = "public";
  }

  const allowFullPaperRequest =
    contentCategory === "research_paper" &&
    fullPaperAccessMode === "request_required";

  return {
    ...item,
    content_category: contentCategory,
    post_type: postType,
    visibility_mode: visibilityMode,
    full_paper_access_mode: fullPaperAccessMode,
    allow_full_paper_request: allowFullPaperRequest,
  };
}

async function findUserByEmail(email) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw error;

    const user = data.users.find(
      (item) => item.email?.toLowerCase() === email.toLowerCase(),
    );

    if (user) return user;

    if (data.users.length < 1000) return null;

    page += 1;
  }
}

async function createOrFindAuthUser(profile) {
  const existing = await findUserByEmail(profile.email);

  if (existing) {
    console.log(`Auth user exists: ${profile.email}`);
    return existing;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: profile.email,
    password: profile.password,
    email_confirm: true,
    user_metadata: {
      full_name: profile.full_name,
      department: profile.department,
      role: profile.user_role,
    },
  });

  if (error) throw error;

  console.log(`Created auth user: ${profile.email}`);
  return data.user;
}

async function upsertProfile(user, profile) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: profile.email,
      full_name: profile.full_name,
      department: profile.department,
      skills: profile.skills,
      interests: profile.interests,
      bio: profile.bio,
      user_role: profile.user_role,
      academic_level: profile.academic_level,
      batch: profile.batch,
      session: profile.session,
      graduation_year: profile.graduation_year,
      current_position: profile.current_position,
      company_or_institution: profile.company_or_institution,
      research_area: profile.research_area,
      expertise: profile.expertise,
      office_hours: profile.office_hours,
      mentorship_available: profile.mentorship_available,
      onboarding_completed: true,
      profile_completion_score: 100,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.log(`Profile upsert failed for ${profile.email}:`, error.message);
    throw error;
  }

  console.log(`Upserted profile: ${profile.full_name}`);
}

async function insertContentIfMissing(authorId, rawItem) {
  const item = normalizeContentItem(rawItem);

  const { data: existing, error: existingError } = await supabase
    .from("contents")
    .select("id")
    .eq("user_id", authorId)
    .eq("title", item.title)
    .maybeSingle();

  if (existingError) {
    console.log("Existing content check error:", existingError.message);
  }

  if (existing?.id) {
    console.log(`Content exists: ${item.title}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("contents")
    .insert({
      user_id: authorId,
      title: item.title,
      content: item.content,
      abstract: item.abstract || null,
      post_type: item.post_type,
      content_category: item.content_category,
      keywords: item.keywords || null,
      visibility_mode: item.visibility_mode,
      full_paper_access_mode: item.full_paper_access_mode,
      allow_full_paper_request: item.allow_full_paper_request,
      doi: item.doi || null,
      publication_status: "published",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.log(`Content insert failed: ${item.title}`);
    console.log(error);
    throw error;
  }

  console.log(`Inserted content: ${item.title}`);
  return data.id;
}

async function main() {
  const userMap = new Map();

  for (const profile of demoProfiles) {
    const user = await createOrFindAuthUser(profile);
    await upsertProfile(user, profile);
    userMap.set(profile.email, user.id);
  }

  for (const item of demoPosts) {
    const authorId = userMap.get(item.authorEmail);

    if (!authorId) {
      console.log(`Missing author for ${item.title}`);
      continue;
    }

    await insertContentIfMissing(authorId, item);
  }

  console.log("");
  console.log("Demo seed completed successfully.");
  console.log("");
  console.log("Demo login password for all users:");
  console.log(DEFAULT_PASSWORD);
  console.log("");
  console.log("Demo emails:");
  demoProfiles.forEach((profile) => {
    console.log(profile.email);
  });
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});