import Image from "next/image";
import type { Asset } from "@/modules/domain/types";

interface FramedImageProps {
  asset: Asset;
  sizes: string;
  eager?: boolean;
  className?: string;
}

export function FramedImage({ asset, sizes, eager = false, className = "" }: FramedImageProps) {
  const cropX = asset.cropX ?? 0;
  const cropY = asset.cropY ?? 0;
  const cropWidth = asset.cropWidth ?? 1;
  const cropHeight = asset.cropHeight ?? 1;
  const displayAspect = (asset.displayAspectWidth ?? 0) / (asset.displayAspectHeight ?? 1);
  const cropAspect = (cropWidth * asset.width) / (cropHeight * asset.height);
  const hasFraming = displayAspect > 0 && Math.abs(displayAspect - cropAspect) < 0.03;

  if (!hasFraming) {
    return (
      <Image
        src={asset.url}
        alt={asset.alt}
        fill
        loading={eager ? "eager" : undefined}
        sizes={sizes}
        className={`object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className="absolute"
      style={{
        left: `${(-cropX / cropWidth) * 100}%`,
        top: `${(-cropY / cropHeight) * 100}%`,
        width: `${100 / cropWidth}%`,
        height: `${100 / cropHeight}%`
      }}
    >
      <Image
        src={asset.url}
        alt={asset.alt}
        fill
        loading={eager ? "eager" : undefined}
        sizes={sizes}
        className={`object-fill ${className}`}
      />
    </div>
  );
}
