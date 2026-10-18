// Links quiz countries (ISO 3166-1 alpha-2) to shapes in world-atlas/countries-50m.json,
// which identifies countries by ISO 3166-1 numeric code.
export const MAP_IDS: Record<string, string> = {
  dz: "012", ao: "024", bj: "204", bw: "072", bf: "854", bi: "108",
  cv: "132", cm: "120", cf: "140", td: "148", km: "174", cg: "178",
  cd: "180", ci: "384", dj: "262", eg: "818", gq: "226", er: "232",
  sz: "748", et: "231", ga: "266", gm: "270", gh: "288", gn: "324",
  gw: "624", ke: "404", ls: "426", lr: "430", ly: "434", mg: "450",
  mw: "454", ml: "466", mr: "478", mu: "480", ma: "504", mz: "508",
  na: "516", ne: "562", ng: "566", rw: "646", st: "678", sn: "686",
  sc: "690", sl: "694", so: "706", za: "710", ss: "728", sd: "729",
  tz: "834", tg: "768", tn: "788", ug: "800", zm: "894", zw: "716",
  af: "004", am: "051", az: "031", bh: "048", bd: "050", bt: "064",
  bn: "096", kh: "116", cn: "156", cy: "196", ge: "268", in: "356",
  id: "360", ir: "364", iq: "368", il: "376", jp: "392", jo: "400",
  kz: "398", kw: "414", kg: "417", la: "418", lb: "422", my: "458",
  mv: "462", mn: "496", mm: "104", np: "524", kp: "408", om: "512",
  pk: "586", ps: "275", ph: "608", qa: "634", sa: "682", sg: "702",
  kr: "410", lk: "144", sy: "760", tw: "158", tj: "762", th: "764",
  tl: "626", tr: "792", tm: "795", ae: "784", uz: "860", vn: "704",
  ye: "887", al: "008", ad: "020", at: "040", by: "112", be: "056",
  ba: "070", bg: "100", hr: "191", cz: "203", dk: "208", ee: "233",
  fi: "246", fr: "250", de: "276", gr: "300", hu: "348", is: "352",
  ie: "372", it: "380", lv: "428", li: "438", lt: "440", lu: "442",
  mt: "470", md: "498", mc: "492", me: "499", nl: "528", mk: "807",
  no: "578", pl: "616", pt: "620", ro: "642", ru: "643", sm: "674",
  rs: "688", sk: "703", si: "705", es: "724", se: "752", ch: "756",
  ua: "804", gb: "826", va: "336", ag: "028", bs: "044", bb: "052",
  bz: "084", ca: "124", cr: "188", cu: "192", dm: "212", do: "214",
  sv: "222", gd: "308", gt: "320", ht: "332", hn: "340", jm: "388",
  mx: "484", ni: "558", pa: "591", kn: "659", lc: "662", vc: "670",
  tt: "780", us: "840", ar: "032", bo: "068", br: "076", cl: "152",
  co: "170", ec: "218", gy: "328", py: "600", pe: "604", sr: "740",
  uy: "858", ve: "862", au: "036", fj: "242", ki: "296", mh: "584",
  fm: "583", nr: "520", nz: "554", pw: "585", pg: "598", ws: "882",
  sb: "090", to: "776", vu: "548",
};

// Shapes that have no numeric id in the atlas, matched by their name instead.
// Somaliland and Northern Cyprus are drawn as part of Somalia and Cyprus.
export const MAP_NAMES: Record<string, string> = {
  Kosovo: "xk",
  Somaliland: "so",
  "N. Cyprus": "cy",
};

// Countries too small to appear in the atlas, shown as a dot: [longitude, latitude].
export const MAP_POINTS: Record<string, [number, number]> = {
  tv: [179.2, -8.5],
};
