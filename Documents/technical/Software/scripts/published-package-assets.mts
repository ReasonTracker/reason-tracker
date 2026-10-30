export const PUBLISHED_PACKAGE_ASSETS = [
  {
    from: "website",
    packageName: "@reasontracker/components",
    specifier: "@reasontracker/components/brand.css",
    output: "css/brand.css",
    stripTypes: false,
  },
  {
    from: "website",
    packageName: "@reasontracker/components",
    specifier: "@reasontracker/components/brandSequence.css",
    output: "css/brand-sequence.css",
    stripTypes: false,
  },
  {
    from: "website",
    packageName: "@reasontracker/components",
    specifier: "@reasontracker/components/brandSequenceMotion",
    output: "modules/brand-sequence-motion.js",
    stripTypes: true,
  },
] as const;
