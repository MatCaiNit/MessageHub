// Theme sang (light) - dung chung toan bo app
export const C = {
  // Nen
  bg: '#F5F5F7',          // nen chinh - xam nhe (giong iOS/macOS)
  panel: '#FFFFFF',        // nen card, sidebar, header
  panel2: '#F0F0F2',       // nen input, badge

  // Vien
  border: '#E0E0E5',
  borderLight: '#EDEDED',

  // Text
  text: '#1A1A2E',         // text chinh
  dim: '#8A8A9A',           // text phu, placeholder
  white: '#FFFFFF',

  // Brand
  accent: '#4F8CFF',       // xanh chinh
  accentDim: '#EBF1FF',    // xanh nhat (nen bubble minh)
  accentText: '#2563EB',   // xanh dam hon cho text tren nen sang

  // Trang thai
  danger: '#EF4444',
  ok: '#22C55E',
  warn: '#F59E0B',
  deviceColor: '#F59E0B',   // mau vang cam cho device
  deviceBg: '#FFFBEB',
  deviceBorder: '#FCD34D',

  // Bubble
  bubbleIn: '#FFFFFF',      // tin nhan nguoi khac: trang, co bong
  bubbleOut: '#4F8CFF',     // tin nhan cua minh: xanh accent
  bubbleDevice: '#FFFBEB',  // tin nhan device: vang nhat
};

export const FONT = {
  xs: 11, sm: 12, base: 14, md: 15, lg: 17, xl: 20, xxl: 24,
};

export const RADIUS = {
  sm: 6, md: 10, lg: 16, full: 999,
};

export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
  },
};
