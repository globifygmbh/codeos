import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../stores/store";
import AddProjectModal from "./AddProjectModal";
import ProjectCard from "./ProjectCard";

export default function ProjectList() {
  const { projects, selectedProjectId, selectProject, loadProjects, fetchGitStatus } =
    useStore();

  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  // Eagerly fetch git status for all projects.
  useEffect(() => {
    for (const p of projects) {
      fetchGitStatus(p.id, p.path);
    }
  }, [projects.length]);

  return (
    <div className="view-enter p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Projects</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {projects.length} project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm text-white hover:bg-accent-blue/80"
        >
          <Plus size={15} />
          Add Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-16 text-center">
          <p className="mb-2 text-sm text-gray-400">No projects yet</p>
          <p className="mb-6 text-xs text-gray-600">
            Add a local project folder to start managing it.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-lg bg-accent-blue/10 px-4 py-2 text-sm text-accent-blue hover:bg-accent-blue/20"
          >
            <Plus size={14} />
            Add your first project
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isSelected={selectedProjectId === project.id}
              onSelect={() =>
                selectProject(
                  selectedProjectId === project.id ? null : project.id
                )
              }
            />
          ))}
        </div>
      )}

      {showAdd && <AddProjectModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}
