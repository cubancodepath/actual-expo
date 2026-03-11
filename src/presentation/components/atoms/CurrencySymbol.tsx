import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from './Text';
import type { SvgSymbolData } from '../../../lib/currencies';

interface CurrencySymbolProps {
  symbol: string;
  svgSymbol?: SvgSymbolData;
  fontSize: number;
  color: string;
}

/**
 * Renders a currency symbol — either as text (most currencies) or as an
 * inline SVG graphic (for symbols not yet in Unicode, e.g. AED Dirham).
 * Scales the SVG to match the surrounding font size.
 */
export function CurrencySymbol({ symbol, svgSymbol, fontSize, color }: CurrencySymbolProps) {
  if (!svgSymbol) {
    return (
      <Text style={{ fontSize, color, lineHeight: fontSize * 1.2 }}>
        {symbol}
      </Text>
    );
  }

  const [, , vbWidth, vbHeight] = svgSymbol.viewBox;
  const aspectRatio = vbWidth / vbHeight;
  // Scale to cap-height (~70% of fontSize) so the SVG matches the visual
  // height of digit glyphs rather than the full em-square.
  const height = Math.round(fontSize * 0.7);
  const width = Math.round(height * aspectRatio);

  return (
    <View style={{ width, height, justifyContent: 'center' }}>
      <Svg width={width} height={height} viewBox={svgSymbol.viewBox.join(' ')}>
        {svgSymbol.paths.map((d, i) => (
          <Path key={i} d={d} fill={color} />
        ))}
      </Svg>
    </View>
  );
}
