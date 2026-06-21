'use client';

import { QRCodeSVG } from 'qrcode.react';

interface QRCardProps {
  url: string;
  label?: string;
  size?: number;
  showDetails?: boolean;
}

export function QRCard({
  url,
  label = '参加用QRコード',
  size = 240,
  showDetails = true,
}: QRCardProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-2xl flex flex-col items-center gap-2">
      <QRCodeSVG value={url} size={size} includeMargin level="M" />
      {showDetails && (
        <>
          <div className="text-xs text-gray-500 mt-1">{label}</div>
          <code className="text-sm break-all text-sky-deep">{url}</code>
        </>
      )}
    </div>
  );
}
