import { Play, RefreshCw, Square } from "lucide-react";
import { useStore } from "../stores/store";
import type { ServiceStatus } from "../types";

function StatusDot({ state }: { state: ServiceStatus["state"] }) {
  const map: Record<ServiceStatus["state"], string> = {
    running:      "bg-accent-green dot-running",
    stopped:      "bg-gray-600",
    error:        "bg-accent-red",
    unknown:      "bg-accent-yellow",
    notinstalled: "bg-gray-700",
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${map[state]}`} />;
}

function StateLabel({ state }: { state: ServiceStatus["state"] }) {
  const map: Record<ServiceStatus["state"], [string, string]> = {
    running:      ["Running", "text-accent-green"],
    stopped:      ["Stopped", "text-gray-400"],
    error:        ["Error",   "text-accent-red"],
    unknown:      ["Unknown", "text-accent-yellow"],
    notinstalled: ["Not installed", "text-gray-500"],
  };
  const [label, cls] = map[state];
  return <span className={`text-xs ${cls}`}>{label}</span>;
}

function ServiceCard({ service }: { service: ServiceStatus }) {
  const { startService, stopService, restartService, servicesLoading } = useStore();

  const canStart   = service.state === "stopped"  || service.state === "error";
  const canStop    = service.state === "running";
  const canRestart = service.state === "running";
  const notInstalled = service.state === "notinstalled";

  return (
    <div className="rounded-xl border border-white/5 bg-surface-1 p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StatusDot state={service.state} />
            <span className="text-sm font-medium text-white">{service.name}</span>
          </div>
          {service.brew_name && (
            <p className="mt-0.5 text-xs text-gray-500 font-mono">brew: {service.brew_name}</p>
          )}
        </div>
        <StateLabel state={service.state} />
      </div>

      {service.version && (
        <p className="mb-1 text-xs text-gray-500 truncate">{service.version.split("\n")[0]}</p>
      )}
      {service.port && service.state === "running" && (
        <p className="mb-1 text-xs text-gray-600">Port: {service.port}</p>
      )}
      {service.error && (
        <p className="mb-2 text-xs text-accent-red line-clamp-2">{service.error}</p>
      )}

      {!notInstalled && (
        <div className="mt-3 flex gap-1.5">
          {canStart && (
            <button
              disabled={servicesLoading}
              onClick={() => startService(service.brew_name)}
              className="flex items-center gap-1.5 rounded-md bg-accent-green/10 px-3 py-1.5 text-xs text-accent-green transition hover:bg-accent-green/20 disabled:opacity-40"
            >
              <Play size={11} />
              Start
            </button>
          )}
          {canStop && (
            <button
              disabled={servicesLoading}
              onClick={() => stopService(service.brew_name)}
              className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-white/10 disabled:opacity-40"
            >
              <Square size={11} />
              Stop
            </button>
          )}
          {canRestart && (
            <button
              disabled={servicesLoading}
              onClick={() => restartService(service.brew_name)}
              className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-white/10 disabled:opacity-40"
            >
              <RefreshCw size={11} />
              Restart
            </button>
          )}
        </div>
      )}

      {notInstalled && (
        <p className="mt-2 text-xs text-gray-600">
          Install via Homebrew: <code className="font-mono">brew install {service.brew_name}</code>
        </p>
      )}
    </div>
  );
}

export default function ServiceStatusPanel() {
  const { services, loadServices, servicesLoading } = useStore();

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Services
        </h2>
        <button
          onClick={loadServices}
          disabled={servicesLoading}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-500 transition hover:bg-white/5 hover:text-gray-300 disabled:opacity-40"
        >
          <RefreshCw size={11} className={servicesLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {services.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-surface-1 px-4 py-6 text-center text-sm text-gray-500">
          No services detected. Run setup to configure Homebrew services.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc) => (
            <ServiceCard key={svc.brew_name} service={svc} />
          ))}
        </div>
      )}
    </section>
  );
}
