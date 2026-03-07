export const SettingsWindowPlaceholder = () => {
  return (
    <main className="min-h-screen bg-slate-950 px-8 py-10 text-white">
      <section className="mx-auto flex max-w-3xl flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-10 shadow-2xl shadow-slate-950/50">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-sky-300/90">
          Settings Window
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">设置中心准备中</h1>
        <p className="max-w-2xl text-sm leading-7 text-slate-300">
          设置窗口单实例打开与激活能力已经完成。本阶段先提供独立窗口容器，后续任务会继续补齐导航、表单、快捷键录制与隐私设置。
        </p>
        <div className="grid gap-3 rounded-2xl border border-sky-400/20 bg-sky-400/5 p-5 text-sm text-sky-100 md:grid-cols-2">
          <div>
            <p className="font-medium text-sky-200">当前能力</p>
            <p className="mt-1 text-slate-200">重复打开时激活并聚焦已有设置窗口。</p>
          </div>
          <div>
            <p className="font-medium text-sky-200">下一步</p>
            <p className="mt-1 text-slate-200">补齐左侧导航、分组内容与未保存确认。</p>
          </div>
        </div>
      </section>
    </main>
  );
};
