import { renderToStaticMarkup } from "react-dom/server";
import { FramedImage } from "@/components/ui/framed-image";
import type { Asset } from "@/modules/domain/types";

describe("FramedImage", () => {
  it("clips a framed image inside its own viewport", () => {
    const asset: Asset = {
      id: "asset-framed",
      kind: "talent_cover",
      title: "取景图片",
      alt: "取景图片",
      url: "/media/poster-crimson.svg",
      width: 1600,
      height: 1200,
      cropX: 0.2,
      cropY: 0,
      cropWidth: 0.5625,
      cropHeight: 1,
      displayAspectWidth: 3,
      displayAspectHeight: 4
    };

    document.body.innerHTML = renderToStaticMarkup(
      <div data-testid="frame"><FramedImage asset={asset} sizes="10rem" /></div>
    );

    const viewport = document.querySelector('[data-testid="frame"] > div');
    expect(viewport?.className).toContain("absolute inset-0 overflow-hidden");
    expect(viewport?.firstElementChild?.getAttribute("style")).toContain("width:177.77777777777777%");
  });
});
