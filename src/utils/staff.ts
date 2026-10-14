// The staff page's roster and the portrait markup it needs. Plain data and pure
// helpers so tests can check them without rendering Astro.

const UPLOADS = "/proxy/wp-content/uploads";

// Shown for anyone without a photo. 16 KB, square.
export const DEFAULT_PORTRAIT_SRC = `${UPLOADS}/2025/04/default-profile-picture1-1.jpg`;
const DEFAULT_PORTRAIT_SIZE = 300;

// The WordPress sub-sizes of a responsive portrait (a 4:5 original). The
// originals themselves run to several MB each and are never offered: 768w
// already covers the widest card at 3x DPR.
export const PORTRAIT_WIDTHS = [
  { width: 240, height: 300 },
  { width: 768, height: 960 },
] as const;

// Rendered width of the square portrait at each grid breakpoint. The section is
// 90% of the viewport below lg, then capped at 900px (lg) and 1200px (xl); the
// grid is 2/3/5 columns with a 12px gap, and each card has 5px side padding.
//   base: (90vw - 1 gap) / 2 - 10px      lg: (900 - 4 gaps) / 5 - 10px = 160.4
//   sm:   (90vw - 2 gaps) / 3 - 10px      xl: (1200 - 4 gaps) / 5 - 10px = 220.4
export const PORTRAIT_SIZES = [
  "(min-width: 1280px) 221px",
  "(min-width: 1024px) 161px",
  "(min-width: 640px) calc(30vw - 18px)",
  "calc(45vw - 16px)",
].join(", ");

// One full row at lg+ (5 columns). Everything after it starts below the fold.
export const EAGER_PORTRAITS = 5;

// Paths are relative to wp-content/uploads. Never point one at a file that is
// not served through /proxy.
export type Portrait =
  // Both PORTRAIT_WIDTHS sub-sizes exist next to the original.
  | { kind: "responsive"; path: string }
  // Only the original exists; served as-is at its intrinsic size.
  | { kind: "original"; path: string; width: number; height: number };

export const responsive = (path: string): Portrait => ({ kind: "responsive", path });

export const original = (path: string, width: number, height: number): Portrait => ({
  kind: "original",
  path,
  width,
  height,
});

export interface StaffMember {
  name: string;
  role: string;
  // The desk or role inbox, then the person's own address.
  emails: [string, string];
  // null shows the default portrait.
  photo: Portrait | null;
}

export interface PortraitAttrs {
  src: string;
  srcset?: string;
  sizes?: string;
  width: number;
  height: number;
  alt: string;
  loading: "eager" | "lazy";
  decoding: "async";
}

// "2026/04/Foo.jpg" -> "/proxy/wp-content/uploads/2026/04/Foo-240x300.jpg",
// the name WordPress gives a sub-size of that upload.
export const portraitDerivative = (photo: string, width: number, height: number): string => {
  const dot = photo.lastIndexOf(".");
  if (dot <= photo.lastIndexOf("/")) throw new Error(`portrait has no extension: ${photo}`);
  return `${UPLOADS}/${photo.slice(0, dot)}-${width}x${height}${photo.slice(dot)}`;
};

export const portraitAttrs = (member: StaffMember, index: number): PortraitAttrs => {
  const loading = index < EAGER_PORTRAITS ? "eager" : "lazy";
  const { photo } = member;
  if (!photo) {
    // The generic silhouette says nothing the name below it does not.
    return {
      src: DEFAULT_PORTRAIT_SRC,
      width: DEFAULT_PORTRAIT_SIZE,
      height: DEFAULT_PORTRAIT_SIZE,
      alt: "",
      loading,
      decoding: "async",
    };
  }
  const alt = `Portrait of ${member.name}`;
  if (photo.kind === "original") {
    return {
      src: `${UPLOADS}/${photo.path}`,
      width: photo.width,
      height: photo.height,
      alt,
      loading,
      decoding: "async",
    };
  }
  const [small] = PORTRAIT_WIDTHS;
  return {
    src: portraitDerivative(photo.path, small.width, small.height),
    srcset: PORTRAIT_WIDTHS.map(
      ({ width, height }) => `${portraitDerivative(photo.path, width, height)} ${width}w`,
    ).join(", "),
    sizes: PORTRAIT_SIZES,
    width: small.width,
    height: small.height,
    alt,
    loading,
    decoding: "async",
  };
};

export const STAFF: StaffMember[] = [
  {
    name: "Sanjana Bandi",
    role: "Editor-in-Chief",
    emails: ["editor@thetriangle.org", "sanjana.bandi@thetriangle.org"],
    photo: responsive("2026/04/SanjanaBandi_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Emma Yashinsky",
    role: "Managing Editor",
    emails: ["managingeditor@thetriangle.org", "emma.yashinsky@thetriangle.org"],
    photo: responsive("2026/04/EmmaYashinsky_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Joshua Fendyke",
    role: "Staff Manager",
    emails: ["apply@thetriangle.org", "joshua.fendyke@thetriangle.org"],
    // No WordPress sub-sizes exist for this upload.
    photo: original("2026/09/josh-fendyke-scaled.jpg", 5198, 3462),
  },
  {
    name: "Grace Dermody",
    role: "Production Manager",
    emails: ["production@thetriangle.org", "grace.dermody@thetriangle.org"],
    photo: responsive("2026/04/GraceDermody_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Soraya Jimenez",
    role: "Co-Chief Business Manager",
    emails: ["business@thetriangle.org", "soraya.jimenez@thetriangle.org"],
    photo: responsive("2026/04/SorayaJimenez_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Chase Kurtz",
    role: "Co-Chief Business Manager",
    emails: ["business@thetriangle.org", "chase.kurtz@thetriangle.org"],
    photo: responsive("2026/04/ChaseKurtz_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Carter Blake",
    role: "Chief Copy Editor",
    emails: ["copyediting@thetriangle.org", "carter.blake@thetriangle.org"],
    photo: responsive("2026/04/CarterBlake_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Erik Heyman-Meltzer",
    role: "Co-Chief News Editor",
    emails: ["news@thetriangle.org", "erik.heyman-meltzer@thetriangle.org"],
    photo: responsive("2026/04/ErikHeyman-Meltzer_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Subiksha Ganesh",
    role: "Co-Chief News Editor",
    emails: ["news@thetriangle.org", "subiksha.ganesh@thetriangle.org"],
    photo: responsive("2026/04/SubikshaGanesh_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Sophia Remorenko",
    role: "Co-Chief Comics Editor",
    emails: ["comics@thetriangle.org", "sophia.remorenko@thetriangle.org"],
    photo: responsive("2026/04/SophiaRemorenko_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Coco Li",
    role: "Co-Chief Comics Editor",
    emails: ["comics@thetriangle.org", "coco.li@thetriangle.org"],
    photo: responsive("2026/04/CocoLi_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Ava Buckingham",
    role: "Co-Chief Sports Editor",
    emails: ["sports@thetriangle.org", "ava.buckingham@thetriangle.org"],
    photo: responsive("2026/04/AvaBuckingham_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Janine Gin",
    role: "Co-Chief Sports Editor",
    emails: ["sports@thetriangle.org", "janine.gin@thetriangle.org"],
    photo: responsive("2026/04/JanineGin_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Rocco Fonseca",
    role: "Co-Chief Photo Editor",
    emails: ["photos@thetriangle.org", "rocco.fonseca@thetriangle.org"],
    photo: responsive("2026/04/RoccoFonseca_byKaseyShamis.jpg"),
  },
  {
    name: "Navneeth Nalajala",
    role: "Co-Chief Photo Editor",
    emails: ["photos@thetriangle.org", "navneeth.nalajala@thetriangle.org"],
    photo: responsive("2026/04/NavneethNalajala_byKaseyShamis.jpg"),
  },
  {
    name: "Audrey Scott",
    role: "Co-Chief A&E Editor",
    emails: ["entertainment@thetriangle.org", "audrey.scott@thetriangle.org"],
    photo: responsive("2026/04/AudreyScott_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Bobby Saunders",
    role: "Co-Chief A&E Editor",
    emails: ["entertainment@thetriangle.org", "bobby.saunders@thetriangle.org"],
    photo: responsive("2026/04/BobbySaunders_byKaseyShamis.jpg"),
  },
  {
    name: "Lena Luciano",
    role: "Co-Chief Opinion Editor",
    emails: ["opinion@thetriangle.org", "lena.luciano@thetriangle.org"],
    photo: responsive("2026/04/LenaLuciano_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Elliott Ruvalcaba",
    role: "Co-Chief Opinion Editor",
    emails: ["opinion@thetriangle.org", "elliott.ruvalcaba@thetriangle.org"],
    photo: responsive("2026/04/ElliotRuvalcaba_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Michael Davis",
    role: "Co-Chief IT Director",
    emails: ["support@thetriangle.org", "michael.davis@thetriangle.org"],
    photo: responsive("2026/04/MichaelDavis_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Steve Huynh",
    role: "Co-Chief IT Director",
    emails: ["support@thetriangle.org", "steve.huynh@thetriangle.org"],
    photo: responsive("2026/04/SteveHuynh_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Gabby Rodriguez",
    role: "Social Media Manager",
    emails: ["socialmedia@thetriangle.org", "gabby.rodriguez@thetriangle.org"],
    photo: responsive("2026/04/GabbyRodriguez_byKaseyShamis_Scaled.jpg"),
  },
  {
    name: "Zarina Morgan",
    role: "General Edboard Member",
    emails: ["edboard@thetriangle.org", "zarina.morgan@thetriangle.org"],
    photo: responsive("2025/10/ZarinaMorgan_byKaseyShamisSmall.jpg"),
  },
  {
    name: "Lucas Tusinean",
    role: "General Edboard Member",
    emails: ["edboard@thetriangle.org", "lucas.tusinean@thetriangle.org"],
    photo: responsive("2025/10/LucasTusinean_byKaseyShamis.jpg"),
  },
  {
    name: "Tegan Doherty",
    role: "General Edboard Member",
    emails: ["edboard@thetriangle.org", "tegan.doherty@thetriangle.org"],
    photo: responsive("2026/04/TeganDoherty_byKaseyShamis_Scaled.jpg"),
  },
];
