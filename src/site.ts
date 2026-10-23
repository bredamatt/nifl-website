export interface Brand {
  /** Name used in the page title. */
  name: string;
  /** Name as shown in the headline. */
  display: string;
  /** Domain shown in the footer. */
  domain: string;
  /** Colour of the dot in the sigil. */
  accent: string;
  /** Wide letter spacing for an all-caps headline. */
  caps: boolean;
}

const NIFL: Brand = {
  name: 'nifl',
  display: 'nifl',
  domain: 'nifl.ai',
  accent: '#8FD8FF',
  caps: false,
};

const NIFLHEIM: Brand = {
  name: 'Niflheim',
  display: 'NIFLHEIM',
  domain: 'niflheim.ai',
  accent: '#FF6A2B',
  caps: true,
};

/** Switch to NIFLHEIM to use the other name. */
export const BRAND: Brand = NIFL;

export const SITE = {
  tagline: 'Sealed compute for AI safety research.',
  /** Point this at your access form, or use a mailto: link. */
  accessHref: '#',
};

export const BRANDS = { NIFL, NIFLHEIM };
