import Image from "next/image";

/**
 * The ResearchGram mark (audit RG-35). The file is 192px (8 KB) instead of the
 * original 1254px (770 KB), and next/image sends each screen a WebP/AVIF copy
 * at the size it is shown at.
 *
 * `alt` stays empty when the name "ResearchGram" is written next to the logo,
 * so screen readers do not read the name twice.
 */
export default function BrandLogo({
  size,
  className = "",
  eager = false,
  alt = "",
}: {
  /** Size in CSS pixels (the logo is square). */
  size: number;
  className?: string;
  /** Load right away; use for logos at the top of the page. */
  eager?: boolean;
  alt?: string;
}) {
  return (
    <Image
      src="/logos/researchgram-logo.png"
      alt={alt}
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      className={`object-contain ${className}`.trim()}
    />
  );
}
