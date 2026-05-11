import { useRef, useState } from "react";
import { Upload, Image as ImageIcon, X } from "lucide-react";
import { TextInput } from "./forms";

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ACCEPTED = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml";

// 图片输入：URL 或本地上传（base64 内嵌到 deck）。
// 上传 > 2MB 拒绝，提示用户改用 URL。
export function ImageInput({
  value,
  onChange,
  placeholder = "https:// 或上传本地图片",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`图片超过 2MB（${(file.size / 1024 / 1024).toFixed(2)}MB）。建议先压缩或改用 URL`);
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setUploading(false);
      const result = reader.result;
      if (typeof result === "string") onChange(result);
    };
    reader.onerror = () => {
      setUploading(false);
      setError("读取文件失败");
    };
    reader.readAsDataURL(file);
  };

  const isDataUrl = value.startsWith("data:image/");
  const showPreview = value && (isDataUrl || /^https?:\/\//.test(value));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <TextInput
          value={isDataUrl ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={isDataUrl}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          title="上传本地图片"
          className="px-2 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-600 inline-flex items-center gap-1 text-xs flex-shrink-0 disabled:opacity-40"
        >
          <Upload size={12} />
          {uploading ? "处理中" : "上传"}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {isDataUrl && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-700">
          <ImageIcon size={11} />
          <span className="flex-1 truncate">已使用本地上传图片（base64 内嵌）</span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="hover:bg-emerald-100 rounded p-0.5"
            title="清除"
          >
            <X size={10} />
          </button>
        </div>
      )}

      {showPreview && (
        <div className="rounded border border-slate-200 overflow-hidden bg-slate-50 max-h-24 flex items-center justify-center">
          {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
          <img
            src={value}
            alt="image preview"
            className="max-w-full max-h-24 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      {error && (
        <p className="text-[10px] text-rose-600 leading-relaxed">{error}</p>
      )}
      <p className="text-[10px] text-slate-400">
        本地上传会以 base64 内嵌到 deck，体积较大；URL 更轻量
      </p>
    </div>
  );
}
