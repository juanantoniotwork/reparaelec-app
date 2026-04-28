import React from 'react';
import Svg, { Rect, Polygon, G } from 'react-native-svg';
import { useTheme } from '../ThemeContext';

type Props = {
  size?: number;
};

const BG_LIGHT = '#1a1a2e';
const BG_DARK = '#2563eb';
const WRENCH = '#ffffff';
const BOLT = '#fbbf24';

export default function LogoIcon({ size = 40 }: Props) {
  const { isDark } = useTheme();
  const bg = isDark ? BG_DARK : BG_LIGHT;

  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Rect x={0} y={0} width={40} height={40} rx={12} fill={bg} />

      <G rotation={-45} origin="20, 20">
        <Rect x={14} y={18} width={18} height={4} rx={1} fill={WRENCH} />
        <Rect x={7} y={13} width={11} height={14} rx={2} fill={WRENCH} />
        <Rect x={5} y={17} width={6} height={6} fill={bg} />
      </G>

      <Polygon
        points="24,8 13,22 19,22 16,32 27,18 21,18"
        fill={BOLT}
      />
    </Svg>
  );
}
