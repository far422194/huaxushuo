// 仅静态导入白名单 71 个 lucide 图标，避免 `import *` 把全部 1500+ 图标打进 bundle。
// 与 shared/dsl/icons.ts 的 HXS_ICON_NAMES 一一对应。

import {
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown,
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown,
  ExternalLink, Link,
  Check, X, AlertCircle, Info, AlertTriangle,
  Mail, Phone, MessageCircle, Send,
  Play, Pause, Image, Video, Music, MonitorPlay, Presentation,
  Search, Filter, Settings, Menu, Plus,
  Layers, LayoutTemplate, Palette, RefreshCw, SlidersHorizontal,
  FileText, MousePointerClick,
  Star, Heart, ThumbsUp, Award, Crown, Zap, Flame, Box,
  BarChart, TrendingUp, Activity, Target,
  Lock, Shield, Key, ShieldCheck,
  Clock, Calendar, MapPin, Globe,
  User, Users, UserPlus,
  ShoppingCart, CreditCard, DollarSign,
  Sparkles, Wand2, Lightbulb, Rocket, Compass, Eye, CheckCircle,
} from "lucide-react";

import type { HxsIconName } from "@shared/dsl";

export const ICON_MAP: Record<HxsIconName, React.FC<any>> = {
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown,
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown,
  ExternalLink, Link,
  Check, X, AlertCircle, Info, AlertTriangle,
  Mail, Phone, MessageCircle, Send,
  Play, Pause, Image, Video, Music, MonitorPlay, Presentation,
  Search, Filter, Settings, Menu, Plus,
  Layers, LayoutTemplate, Palette, RefreshCw, SlidersHorizontal,
  FileText, MousePointerClick,
  Star, Heart, ThumbsUp, Award, Crown, Zap, Flame, Box,
  BarChart, TrendingUp, Activity, Target,
  Lock, Shield, Key, ShieldCheck,
  Clock, Calendar, MapPin, Globe,
  User, Users, UserPlus,
  ShoppingCart, CreditCard, DollarSign,
  Sparkles, Wand2, Lightbulb, Rocket, Compass, Eye, CheckCircle,
};
