import {
  geoArea,
  geoCentroid,
  geoGraticule10,
  geoNaturalEarth1,
  geoPath,
  type GeoPath,
  type GeoPermissibleObjects,
  type GeoProjection,
} from "d3-geo";
import { select, type Selection } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import type { Feature, Geometry, MultiPoint, Point, Polygon } from "geojson";
import { feature, merge } from "topojson-client";
import type { GeometryCollection, GeometryObject, Topology } from "topojson-specification";
import worldUrl from "world-atlas/countries-50m.json?url";
import type { Country, Region } from "./data";
import { MAP_IDS, MAP_NAMES, MAP_POINTS } from "./map-ids";

export type MapRegion = Region | "All";

interface MapCountry {
  code: string;
  name: string;
  /** Full outline, or null for countries only shown as a dot. */
  shape: Geometry | null;
  /** Largest landmass (or the dot), used for framing, labels and dots. */
  main: Polygon | Point;
}

export interface World {
  countries: MapCountry[];
  /** Territories that aren't quiz answers (Greenland, Antarctica, …). */
  others: Geometry[];
}

type Atlas = Topology<{ countries: GeometryCollection<{ name: string }> }>;

export async function loadWorld(quizCountries: Country[]): Promise<World> {
  const res = await fetch(worldUrl);
  if (!res.ok) throw new Error(`Map download failed (${res.status})`);
  const atlas = (await res.json()) as Atlas;

  const idToCode = new Map(Object.entries(MAP_IDS).map(([code, id]) => [id, code]));
  const toGeometry = (g: GeometryObject) => (feature(atlas, g) as Feature).geometry;
  const groups = new Map<string, GeometryObject[]>();
  const others: Geometry[] = [];

  for (const g of atlas.objects.countries.geometries) {
    const code =
      (g.id !== undefined && idToCode.get(String(g.id))) || MAP_NAMES[(g.properties as { name?: string } | undefined)?.name ?? ""];
    if (code) {
      groups.set(code, [...(groups.get(code) ?? []), g]);
    } else {
      others.push(toGeometry(g));
    }
  }

  const countries: MapCountry[] = [];
  for (const c of quizCountries) {
    const parts = groups.get(c.code);
    const point = MAP_POINTS[c.code];
    if (parts) {
      // Merging removes the internal border, e.g. Somalia + Somaliland.
      const shape: Geometry =
        parts.length > 1 ? merge(atlas, parts as never) : toGeometry(parts[0]);
      countries.push({ code: c.code, name: c.name, shape, main: largestPolygon(shape) });
    } else if (point) {
      countries.push({ code: c.code, name: c.name, shape: null, main: { type: "Point", coordinates: point } });
    }
  }

  return { countries, others };
}

function largestPolygon(shape: Geometry): Polygon | Point {
  if (shape.type === "Polygon") return shape;
  if (shape.type === "MultiPolygon") {
    let best: Polygon = { type: "Polygon", coordinates: shape.coordinates[0] };
    let bestArea = geoArea(best);
    for (const coordinates of shape.coordinates.slice(1)) {
      const p: Polygon = { type: "Polygon", coordinates };
      const a = geoArea(p);
      if (a > bestArea) [best, bestArea] = [p, a];
    }
    return best;
  }
  return { type: "Point", coordinates: geoCentroid(shape) };
}

// ---------- Views ----------
type Box = [[number, number], [number, number]]; // [[west, south], [east, north]]

const VIEWS: Record<MapRegion, { center: number; box: Box }> = {
  // Stops just short of the edges: the meridian opposite the centre is where the map is cut.
  All: { center: 10, box: [[-169.9, -56], [189.9, 78]] },
  Africa: { center: 15, box: [[-19, -36], [53, 38]] },
  Asia: { center: 90, box: [[26, -11], [146, 54]] },
  Europe: { center: 15, box: [[-25, 34], [45, 71]] },
  "North America": { center: -100, box: [[-168, 7], [-52, 72]] },
  "South America": { center: -60, box: [[-82, -56], [-34, 13]] },
  Oceania: { center: 160, box: [[110, -48], [190, 20]] },
};

/** Points along the edge of a lon/lat box, so curved projections fit it properly. */
function boxOutline([[w, s], [e, n]]: Box): MultiPoint {
  const coordinates: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const lon = w + ((e - w) * i) / 10;
    const lat = s + ((n - s) * i) / 10;
    coordinates.push([lon, s], [lon, n], [w, lat], [e, lat]);
  }
  return { type: "MultiPoint", coordinates };
}

// Countries smaller than ~6,000 km² (Luxembourg, Malta, Caribbean and Pacific
// islands…) also get a dot, since their outline is too small to tap.
const EARTH_RADIUS_KM = 6371;
const SMALL_AREA = 6000 / EARTH_RADIUS_KM ** 2; // steradians
const DOT_RADIUS = 4.5;
const HIT_RADIUS = 13;
const MAX_ZOOM = 60;

type SvgSel = Selection<SVGSVGElement, unknown, null, undefined>;
type GSel = Selection<SVGGElement, unknown, null, undefined>;

interface Label {
  code: string;
  text: string;
  kind: "correct" | "wrong";
}

// ---------- Interactive map ----------
export class WorldMap {
  /** Called when the player taps a quiz country. */
  onSelect: (code: string) => void = () => {};

  private svg: SvgSel;
  private viewport: GSel;
  private zoomer: ZoomBehavior<SVGSVGElement, unknown>;
  private byCode: Map<string, MapCountry>;
  private projection: GeoProjection = geoNaturalEarth1();
  private path: GeoPath = geoPath(this.projection);
  private size = { width: 0, height: 0 };
  private region: MapRegion = "All";
  private k = 1;
  /** Starting view; zoomed in when the map is much taller than the region. */
  private home: ZoomTransform = zoomIdentity;

  private selected: string | null = null;
  private revealed: { correct: string; chosen: string } | null = null;

  constructor(private host: HTMLElement, private world: World) {
    this.byCode = new Map(world.countries.map((c) => [c.code, c]));

    this.svg = select(host)
      .append("svg")
      .attr("class", "world-map")
      .attr("role", "application")
      .attr("aria-label", "World map. Drag to move, pinch or scroll to zoom.");
    this.viewport = this.svg.append("g");

    this.zoomer = zoom<SVGSVGElement, unknown>()
      .clickDistance(6)
      .on("zoom", (e: { transform: ZoomTransform }) => this.applyZoom(e.transform));
    this.svg.call(this.zoomer).on("dblclick.zoom", null);

    // Re-draws on resize, and when the map first becomes visible.
    new ResizeObserver(() => this.render()).observe(host);
  }

  setRegion(region: MapRegion): void {
    if (region === this.region) return;
    this.region = region;
    this.size = { width: 0, height: 0 };
    this.render();
  }

  /** Clear the previous answer and fly back to the starting view. */
  newQuestion(): void {
    this.selected = null;
    this.revealed = null;
    this.svg.classed("locked", false);
    this.paint();
    this.resetView(true);
  }

  select(code: string | null): void {
    this.selected = code;
    this.paint();
  }

  /** Show the right answer (and the wrong pick, if any) and zoom to them. */
  reveal(correct: string, chosen: string): void {
    this.revealed = { correct, chosen };
    this.selected = null;
    this.svg.classed("locked", true);
    this.paint();
    this.focus(correct === chosen ? [correct] : [correct, chosen], true);
  }

  zoomBy(factor: number): void {
    this.svg.transition().duration(250).call(this.zoomer.scaleBy, factor);
  }

  resetView(animate: boolean): void {
    if (animate) {
      this.svg.transition().duration(600).call(this.zoomer.transform, this.home);
    } else {
      this.svg.call(this.zoomer.transform, this.home);
    }
  }

  // ---------- Drawing ----------
  private render(): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return; // hidden
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };

    const view = VIEWS[this.region];
    const outline = boxOutline(view.box);
    const pad = Math.min(width, height) * 0.04;
    this.projection = geoNaturalEarth1()
      .rotate([-view.center, 0])
      .fitExtent([[pad, pad], [width - pad, height - pad]], outline);
    this.path = geoPath(this.projection);

    // On a tall, narrow screen the wide world map ends up as a thin strip,
    // so start zoomed in to fill the height; pinch out to see everything.
    const [[bx0, by0], [bx1, by1]] = this.path.bounds(outline);
    const fill = Math.min(2.4, Math.max(1, (height * 0.9) / (by1 - by0)));
    this.home = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(fill)
      .translate(-(bx0 + bx1) / 2, -(by0 + by1) / 2);

    this.svg.attr("viewBox", `0 0 ${width} ${height}`);
    this.viewport.selectAll("*").remove();

    const sphere: GeoPermissibleObjects = { type: "Sphere" };
    this.viewport.append("path").attr("class", "sphere").attr("d", this.path(sphere));
    this.viewport.append("path").attr("class", "graticule").attr("d", this.path(geoGraticule10()));

    const others = this.viewport.append("g").attr("class", "others");
    for (const g of this.world.others) others.append("path").attr("d", this.path(g));

    const shapes = this.viewport.append("g").attr("class", "shapes");
    const dots = this.viewport.append("g").attr("class", "dots");

    for (const c of this.world.countries) {
      const pick = () => this.pick(c.code);

      if (c.shape) {
        shapes
          .append("path")
          .attr("class", "country")
          .attr("data-code", c.code)
          .attr("d", this.path(c.shape))
          .on("click", pick);
      }

      if (!c.shape || geoArea(c.shape) < SMALL_AREA) {
        const xy = this.projection(geoCentroid(c.main));
        if (!xy) continue;
        const dot = dots.append("g").attr("class", "dot country").attr("data-code", c.code).on("click", pick);
        dot.append("circle").attr("class", "hit").attr("cx", xy[0]).attr("cy", xy[1]);
        dot.append("circle").attr("class", "mark").attr("cx", xy[0]).attr("cy", xy[1]);
      }
    }

    this.viewport.append("g").attr("class", "labels");

    const [[x0, y0], [x1, y1]] = this.path.bounds(sphere);
    const slack = Math.max(width, height) * 0.25;
    this.zoomer
      .extent([[0, 0], [width, height]])
      .scaleExtent([this.region === "All" ? 1 : 0.6, MAX_ZOOM])
      .translateExtent([[x0 - slack, y0 - slack], [x1 + slack, y1 + slack]]);

    this.paint();
    if (this.revealed) {
      const { correct, chosen } = this.revealed;
      this.focus(correct === chosen ? [correct] : [correct, chosen], false);
    } else {
      this.resetView(false);
    }
  }

  private pick(code: string): void {
    if (this.revealed) return;
    this.select(code);
    this.onSelect(code);
  }

  /** Apply selected / correct / wrong styles and answer labels. */
  private paint(): void {
    const r = this.revealed;
    const all = this.viewport.selectAll<SVGElement, unknown>(".country");
    all.classed("selected", (_, i, nodes) => !r && nodes[i].dataset.code === this.selected);
    all.classed("correct", (_, i, nodes) => !!r && nodes[i].dataset.code === r.correct);
    all.classed("wrong", (_, i, nodes) => !!r && r.chosen !== r.correct && nodes[i].dataset.code === r.chosen);

    // Keep highlighted dots on top of their neighbours.
    this.viewport.selectAll<SVGGElement, unknown>(".dot.selected, .dot.correct, .dot.wrong").raise();

    const labels: Label[] = [];
    if (r) {
      labels.push({ code: r.correct, text: this.byCode.get(r.correct)?.name ?? "", kind: "correct" });
      if (r.chosen !== r.correct) {
        labels.push({ code: r.chosen, text: this.byCode.get(r.chosen)?.name ?? "", kind: "wrong" });
      }
    }
    this.drawLabels(labels);
  }

  private drawLabels(labels: Label[]): void {
    const layer = this.viewport.select<SVGGElement>("g.labels");
    layer.selectAll("*").remove();

    for (const l of labels) {
      const c = this.byCode.get(l.code);
      const xy = c && this.projection(geoCentroid(c.main));
      if (!xy) continue;

      const g = layer
        .append("g")
        .attr("class", `map-label ${l.kind}`)
        .attr("data-x", xy[0])
        .attr("data-y", xy[1]);
      const text = g.append("text").attr("text-anchor", "middle").attr("y", -14).text(l.text);
      const box = text.node()!.getBBox();
      g.insert("rect", "text")
        .attr("x", box.x - 8)
        .attr("y", box.y - 4)
        .attr("width", box.width + 16)
        .attr("height", box.height + 8)
        .attr("rx", 7);
      g.insert("path", "text").attr("class", "pin").attr("d", "M-5,-6 L0,0 L5,-6 Z");
    }
    this.scaleOverlays();
  }

  /** Zoom so the given countries fill the view. */
  private focus(codes: string[], animate: boolean): void {
    const { width, height } = this.size;
    if (!width) return;

    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const code of codes) {
      const c = this.byCode.get(code);
      if (!c) continue;
      const [[a, b], [cx, d]] = this.path.bounds(c.main);
      [x0, y0, x1, y1] = [Math.min(x0, a), Math.min(y0, b), Math.max(x1, cx), Math.max(y1, d)];
    }
    if (!Number.isFinite(x0)) return;

    // Leave room for tiny countries and the labels above them.
    const minSpan = Math.min(width, height) / 6;
    const w = Math.max(x1 - x0, minSpan);
    const h = Math.max(y1 - y0, minSpan);
    const k = Math.min(12, 0.7 / Math.max(w / width, h / height));
    const [minK] = this.zoomer.scaleExtent();
    // A wrong pick on the other side of the world: just show the right answer.
    if (k < minK && codes.length > 1) return this.focus(codes.slice(0, 1), animate);
    const t = zoomIdentity
      .translate(width / 2, height / 2)
      .scale(k)
      .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);

    if (animate) {
      this.svg.transition().duration(900).call(this.zoomer.transform, t);
    } else {
      this.svg.call(this.zoomer.transform, t);
    }
  }

  private applyZoom(t: ZoomTransform): void {
    this.k = t.k;
    this.viewport.attr("transform", t.toString());
    this.scaleOverlays();
  }

  /** Dots and labels keep the same on-screen size at every zoom level. */
  private scaleOverlays(): void {
    const k = this.k;
    this.viewport.selectAll("circle.mark").attr("r", DOT_RADIUS / Math.sqrt(k));
    this.viewport.selectAll("circle.hit").attr("r", HIT_RADIUS / k);
    this.viewport
      .selectAll<SVGGElement, unknown>("g.map-label")
      .attr("transform", function () {
        return `translate(${this.dataset.x},${this.dataset.y}) scale(${1 / k})`;
      });
  }
}
