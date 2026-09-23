import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'en' | 'zh';
type Vars = Record<string, string | number>;
type I18nValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, vars?: Vars) => string;
};

const zh: Record<string, string> = {
  'Sky view': '天空视图',
  'Current link': '当前链路',
  'Link budget': '链路预算',
  'Pass & handover': '过境与切换',
  'Metrics': '实时指标',
  'Satellites': '可见卫星',
  'RF model': '射频模型',
  'Settings': '设置',
  'GLOBAL LEO SKY & LINK LAB': '全球低轨卫星天空与链路实验室',
  'Data error': '数据错误',
  '{count} visible · {place}': '{count} 颗可见 · {place}',
  'GLOBAL OBSERVER': '全球观察点',
  'Which satellites can you see from {place}?': '在 {place} 的天空中能看到哪些卫星？',
  'Choose any observer location on Earth. The URL updates with latitude, longitude and place name, so the exact view can be refreshed, bookmarked or shared.': '可以选择地球上任意观察地点。URL 会同步保存纬度、经度和地点名称，因此刷新、收藏或分享后仍会保留相同视角。',
  'TRACKED SATELLITE': '当前追踪卫星',
  'Searching…': '搜索中…',
  'Pinned manually — automatic handover paused': '已手动锁定——自动切换已暂停',
  'Auto tracking — minimum 20 s hold + 3 dB / 5 s handover rule': '自动追踪——至少保持 20 秒，满足 3 dB / 5 秒切换规则',
  'Return to auto tracking': '恢复自动追踪',
  'CURRENT CONNECTION': '当前连接',
  'One tracked satellite, two different spatial views.': '一颗追踪卫星，两种空间视角。',
  "Current Link explains the radio connection. The globe separately shows the satellite's subpoint on Earth relative to the selected observer.": '当前链路用于解释无线连接；Earth View 单独显示卫星相对于所选观察点的地理投影位置。',
  'SIGNAL JOURNEY': '信号传输路径',
  'Where does the signal power go?': '信号功率都损失到哪里了？',
  'Follow the live link budget from transmitter power through path loss to received power, noise floor, SNR and final link margin.': '沿着实时链路预算依次查看发射功率、路径损耗、接收功率、噪声底、SNR 和最终链路余量。',
  'PASS & HANDOVER': '过境与切换',
  'Keep the satellite stable long enough to understand it.': '保持当前卫星足够稳定，便于观察和理解。',
  'The tracked satellite is held for at least 20 seconds. Automatic handover requires another satellite to be 3 dB better for 5 continuous seconds.': '当前卫星至少保持 20 秒。自动切换要求候选卫星连续 5 秒比当前卫星强至少 3 dB。',
  'LIVE TELEMETRY': '实时遥测',
  'How the tracked satellite changes over time.': '追踪卫星随时间如何变化。',
  'Tracking {satellite} from {place}. Histories reset when you change observer or satellite.': '正在从 {place} 追踪 {satellite}。切换观察点或卫星时，历史曲线会重新开始。',
  'Waiting for a visible satellite.': '正在等待可见卫星。',
  'VISIBLE CONSTELLATION': '可见星座',
  'Satellites above {place} now': '{place} 当前可见卫星',
  '{count} sampled Starlink satellites clear the {mask}° elevation mask. Click any satellite name to pin it and inspect it without automatic switching.': '当前采样星座中有 {count} 颗 Starlink 卫星高于 {mask}° 仰角门限。点击卫星名称即可手动锁定，避免自动切换。',
  'EDUCATIONAL RF MODEL': '教学射频模型',
  'Change the assumptions and watch the link respond.': '修改参数，观察链路如何变化。',
  'RF controls affect the simulated link budget. Observer location changes geometry; orbital positions remain driven by CelesTrak data.': '射频参数会影响模拟链路预算；观察点改变几何关系，轨道位置仍由 CelesTrak 数据驱动。',
  'Orbital data': '轨道数据',
  'Current time': '当前时间',
  'SETTINGS': '设置',
  'Language': '语言',
  'Choose the interface language. This preference is saved in this browser.': '选择界面语言。该偏好会保存在当前浏览器中。',
  'English': 'English',
  '中文': '中文',
  'Interface language': '界面语言',
  'Real orbital geometry · educational RF assumptions': '真实轨道几何 · 教学用途射频假设',

  'OBSERVER LOCATION': '观察点',
  'Search any city or place': '搜索任意城市或地点',
  'e.g. Queenstown, Paris, Shanghai…': '例如：Queenstown、Paris、Shanghai…',
  'Search': '搜索',
  'Use my location': '使用当前位置',
  'Apply coordinates': '应用经纬度',
  'Current device location': '当前设备位置',
  'Requesting browser location…': '正在请求浏览器定位…',
  'Geolocation is not available in this browser.': '当前浏览器不支持定位。',
  'Location permission was not granted.': '未授予定位权限。',
  'No matching place found.': '未找到匹配地点。',
  'Search failed': '搜索失败',
  'Latitude must be −90…90 and longitude −180…180.': '纬度必须在 −90…90，经度必须在 −180…180。',
  'Place search © OpenStreetMap contributors · submit-only search, no autocomplete.': '地点搜索 © OpenStreetMap contributors · 仅提交搜索，不做自动联想。',

  'AZIMUTH–ELEVATION SKY PLOT': '方位角–仰角天空图',
  'Standard observer-centred polar sky plot: azimuth increases clockwise from true north; radial distance is linear zenith distance, r ∝ (90° − elevation).': '标准观察者中心极坐标天空图：方位角从真北开始顺时针增加；径向距离采用线性天顶距，r ∝ (90° − 仰角)。',
  'ZENITH · 90° EL': '天顶 · 90° 仰角',
  'AZIMUTH': '方位角',
  'Measured clockwise from true north: 0° N, 90° E, 180° S, 270° W.': '从真北开始顺时针测量：0° 北、90° 东、180° 南、270° 西。',
  'ELEVATION': '仰角',
  '0° is the astronomical horizon. 90° is directly overhead at the zenith.': '0° 为天文地平线，90° 为正上方天顶。',
  'PLOT PROJECTION': '绘图投影',
  'Linear zenith-distance': '线性天顶距',
  'Radius = R × (90° − elevation) / 90°. This is a coordinate plot, not a camera perspective.': '半径 = R × (90° − 仰角) / 90°。这是坐标图，不是相机透视图。',
  'TRACK': '轨迹',
  'Grey past · cyan future': '灰色过去 · 青色未来',
  'Track points are recomputed from the selected satellite orbit for this observer location.': '轨迹点根据当前观察点和所选卫星轨道重新计算。',
  'CURRENT GEOMETRY': '当前几何关系',
  '{range} km slant range': '斜距 {range} km',
  'Approaching observer': '正在接近观察点',
  'Receding from observer': '正在远离观察点',
  'Altitude {altitude} km · Doppler {doppler} kHz': '高度 {altitude} km · 多普勒 {doppler} kHz',

  'TRACKED LINK · {mode}': '追踪链路 · {mode}',
  'Searching for a visible satellite': '正在搜索可见卫星',
  'Excellent': '优秀',
  'Good': '良好',
  'Fair': '一般',
  'Weak': '较弱',
  'Unavailable': '不可用',
  'Scanning': '扫描中',
  'SIGNAL TO NOISE': '信噪比',
  '{margin} dB margin': '{margin} dB 余量',
  'NORAD ID': 'NORAD 编号',
  'Elevation': '仰角',
  'Azimuth': '方位角',
  'Slant range': '斜距',
  'Altitude': '轨道高度',
  'One-way delay': '单程时延',
  'Received power': '接收功率',
  'Carrier': '载波频率',
  'Link quality': '链路质量',
  'Approaching': '接近中',
  'Receding': '远离中',
  'No satellite currently clears the selected elevation mask.': '当前没有卫星高于所选仰角门限。',
  'Pinned': '手动锁定',
  'Auto': '自动',

  'EARTH VIEW / GROUND TRACK': '地球视图 / 地面轨迹',
  'Real geography, live satellite position': '真实地理底图，实时卫星位置',
  "Zoom from the globe down to the selected observer or the satellite's ground point.": '可从全球视角缩放到所选观察点或卫星地面投影点。',
  'Observer': '观察点',
  'Satellite': '卫星',
  'Globe': '全球',
  'OBSERVER': '观察点',
  'SATELLITE SUBPOINT': '卫星地面投影点',
  '{altitude} km orbital altitude': '轨道高度 {altitude} km',
  'No tracked satellite': '暂无追踪卫星',
  'GROUND TRACK': '地面轨迹',
  'Past + future path': '过去 + 未来轨迹',
  'Grey = past · cyan = future': '灰色 = 过去 · 青色 = 未来',
  'World Imagery is a geographic basemap, not live photography. Observer position, satellite subpoint and ground track are the live layers.': 'World Imagery 是地理底图，并非实时摄影。观察点、卫星地面投影和地面轨迹才是实时图层。',

  'SIGNAL PATH': '信号路径',
  'Link budget · satellite → receiver': '链路预算 · 卫星 → 接收端',
  'all values in dB / dBm': '所有数值单位为 dB / dBm',
  'TX power': '发射功率',
  'TX antenna gain': '发射天线增益',
  'EIRP': 'EIRP',
  'Free-space path loss': '自由空间路径损耗',
  'Other losses': '其他损耗',
  'RX antenna gain': '接收天线增益',
  'Received signal': '接收信号',
  'Noise floor': '噪声底',
  'SNR = signal − noise': 'SNR = 信号 − 噪声',
  'Required SNR: {value} dB': '所需 SNR：{value} dB',
  'Link margin': '链路余量',
  'Link closes under this model': '在当前模型下链路可闭合',
  'Below required SNR': '低于所需 SNR',
  'Why FSPL is so large:': '为什么 FSPL 这么大：',
  'The signal spreads over the {range} km slant range. At {frequency} GHz, free-space path loss is {fspl} dB. Antenna gains recover part of that loss; they do not remove it.': '信号需要跨越 {range} km 的斜距。在 {frequency} GHz 下，自由空间路径损耗为 {fspl} dB。天线增益只能补偿部分损耗，并不能消除传播损耗。',
  'A visible satellite is required before the live link budget can be calculated.': '需要先有可见卫星才能计算实时链路预算。',
  '{value} dBm before RX antenna gain': '接收天线增益前为 {value} dBm',
  '{bandwidth} MHz bandwidth · {nf} dB NF': '{bandwidth} MHz 带宽 · {nf} dB 噪声系数',

  'PASS PREDICTION': '过境预测',
  'No active pass': '暂无活动过境',
  'LOS in ~{minutes} min': '约 {minutes} 分钟后失联',
  'Pass extends beyond window': '过境持续时间超过当前窗口',
  'NOW': '当前',
  'PEAK': '峰值',
  'AT': '时间',
  '+4m': '+4 分钟',
  '+8m': '+8 分钟',
  '+12m': '+12 分钟',

  'HANDOVER LOGIC': '切换逻辑',
  'Should the receiver switch satellites?': '接收端是否应该切换卫星？',
  'SWITCH': '切换',
  'STAY': '保持',
  'The candidate must beat the current satellite by at least {value} dB SNR. This prevents rapid ping-pong switching when two satellites have similar signal quality.': '候选卫星的 SNR 至少要比当前卫星高 {value} dB，避免两颗卫星信号接近时频繁来回切换。',
  'CURRENT LINK': '当前链路',
  'No active link': '暂无活动链路',
  'BEST ALTERNATIVE': '最佳候选',
  'None': '无',
  'No alternate satellite': '暂无候选卫星',
  'Decision': '决策',
  'No comparison available.': '暂无可比较对象。',
  'Candidate is {delta} dB better — switch.': '候选卫星高 {delta} dB——执行切换。',
  'Candidate is only {delta} dB better — needs {gap} dB more.': '候选卫星仅高 {delta} dB——还需高 {gap} dB 才切换。',
  'Current link is {delta} dB stronger — stay connected.': '当前链路强 {delta} dB——保持连接。',

  'Signal-to-noise ratio': '信噪比',
  'Doppler shift': '多普勒频移',
  '60 s history': '60 秒历史',
  'live': '实时',
  'Range': '距离',
  'Doppler': '多普勒',
  'SNR': 'SNR',
  'Status': '状态',
  'Tracked': '追踪中',
  'Best now': '当前最佳',
  'Visible': '可见',
  'Bandwidth': '带宽',
  'Elevation mask': '仰角门限',
  'Noise figure': '噪声系数',
  'Tx power': '发射功率',
  'Tx gain': '发射增益',
  'Rx gain': '接收增益',
  'Other loss': '其他损耗',
};

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = window.localStorage.getItem('leo-link-language');
    return saved === 'zh' ? 'zh' : 'en';
  });

  useEffect(() => {
    window.localStorage.setItem('leo-link-language', language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  const value = useMemo<I18nValue>(() => ({
    language,
    setLanguage: setLanguageState,
    t: (key, vars) => interpolate(language === 'zh' ? (zh[key] ?? key) : key, vars),
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
