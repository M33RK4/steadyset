"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store/AppStore";
import { upsert, del } from "@/lib/domain/changes";
import type { Exercise, ExerciseKind } from "@/lib/domain/types";
import { uuid } from "@/lib/util/ids";
import { Badge, Button, EmptyState, Field, PageHeader, Segmented, Switch } from "@/components/ui/primitives";
import { Dialog, useConfirm, useToast } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { ExerciseDemo } from "../animation/ExerciseDemo";
import { useExercises } from "../common";
import { filterExercises, SearchAndFilter } from "../plans/ExercisePicker";

export function LibraryScreen() {
  const { all } = useExercises();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const list = useMemo(() => filterExercises(all, query, group), [all, query, group]);
  return (
    <div>
      <PageHeader
        title="Exercise library"
        subtitle="How to do every exercise in your plans, with a demonstration of the movement."
        actions={
          <Button variant="secondary" icon="plus" onClick={() => setCreateOpen(true)}>
            Create exercise
          </Button>
        }
      />
      <SearchAndFilter query={query} setQuery={setQuery} group={group} setGroup={setGroup} />
      {list.length === 0 ? (
        <EmptyState icon="search" title="No exercises found">
          Try a different search, or clear the muscle filter.
        </EmptyState>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {list.map((e) => (
            <li key={e.id}>
              <Link href={`/library/${e.slug}`} className="card block overflow-hidden hover:border-accent transition-colors group">
                <div className="p-2">
                  <ExerciseDemo animation={e.animation} name={e.name} compact />
                </div>
                <div className="px-4 pb-4 pt-1">
                  <p className="font-semibold text-lg leading-snug group-hover:text-accent-text">{e.name}</p>
                  <p className="text-sm text-muted mt-0.5">{e.primaryMuscles.join(", ")}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge>{e.equipment[0]}</Badge>
                    {e.custom && <Badge tone="accent">Custom</Badge>}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CustomExerciseDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

export function ExerciseDetailScreen() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(String(params?.slug ?? ""));
  const { all } = useExercises();
  const { data, commit } = useApp();
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const e = all.find((x) => x.slug === slug);
  if (!e)
    return (
      <EmptyState icon="search" title="Exercise not found" action={<Link href="/library" className="font-semibold underline">Back to the library</Link>}>
        It may have been a custom exercise that was deleted.
      </EmptyState>
    );
  const usedIn = data.planExercises.filter((pe) => pe.exerciseId === e.id);
  const usedDays = [...new Set(usedIn.map((u) => u.planDayId))].map((id) => data.planDays.find((d) => d.id === id)).filter(Boolean);
  return (
    <article className="space-y-6">
      <Link href="/library" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <Icon name="chevronLeft" size={16} /> Library
      </Link>
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 items-start">
        <div className="lg:sticky lg:top-6">
          <ExerciseDemo animation={e.animation} name={e.name} />
        </div>
        <div className="space-y-5">
          <header>
            <h1 className="text-3xl md:text-4xl">{e.name}</h1>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <Badge tone="accent">{e.difficulty}</Badge>
              {e.equipment.map((q) => (
                <Badge key={q}>{q}</Badge>
              ))}
            </div>
          </header>
          <dl className="grid grid-cols-2 gap-3">
            <div className="card p-3">
              <dt className="text-sm text-muted">Main muscles</dt>
              <dd className="font-semibold">{e.primaryMuscles.join(", ")}</dd>
            </div>
            <div className="card p-3">
              <dt className="text-sm text-muted">Also works</dt>
              <dd className="font-semibold">{e.secondaryMuscles.join(", ") || "—"}</dd>
            </div>
          </dl>
          {e.summary && (
            <section>
              <h2 className="text-lg mb-1">What it is</h2>
              <p className="text-[17px] leading-relaxed">{e.summary}</p>
            </section>
          )}
          {e.startingPosition && (
            <section>
              <h2 className="text-lg mb-1">Starting position</h2>
              <p>{e.startingPosition}</p>
            </section>
          )}
          {e.steps.length > 0 && (
            <section>
              <h2 className="text-lg mb-2">Step by step</h2>
              <ol className="space-y-2">
                {e.steps.map((s, i) => (
                  <li key={s} className="flex gap-3">
                    <span className="num h-7 w-7 shrink-0 rounded-pill bg-accent-soft text-accent-text grid place-items-center text-sm font-bold">{i + 1}</span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {e.breathing && (
            <section>
              <h2 className="text-lg mb-1">Breathing</h2>
              <p>{e.breathing}</p>
            </section>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            {e.mistakes.length > 0 && (
              <section className="card p-4">
                <h2 className="text-lg mb-2">Common mistakes</h2>
                <ul className="list-disc pl-5 space-y-1">
                  {e.mistakes.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </section>
            )}
            {e.safety.length > 0 && (
              <section className="card p-4">
                <h2 className="text-lg mb-2">Safety</h2>
                <ul className="list-disc pl-5 space-y-1">
                  {e.safety.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          {usedDays.length > 0 && (
            <p className="text-sm text-muted">
              In your plans on: <span className="text-ink font-semibold">{usedDays.map((d) => d!.name).join(", ")}</span>
            </p>
          )}
          {e.custom && (
            <Button
              variant="ghost"
              icon="trash"
              className="text-danger"
              onClick={async () => {
                if (usedIn.length) {
                  toast("Remove this exercise from your plans before deleting it.", { tone: "error" });
                  return;
                }
                const ok = await confirm({ title: `Delete ${e.name}?`, body: "Past workouts keep their record of it.", confirmLabel: "Delete exercise", danger: true });
                if (!ok) return;
                commit([del("exercises", e.id)]);
                toast("Exercise deleted");
                router.push("/library");
              }}
            >
              Delete custom exercise
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export function CustomExerciseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { commit, user } = useApp();
  const toast = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ExerciseKind>("reps");
  const [muscles, setMuscles] = useState("");
  const [equipment, setEquipment] = useState("");
  const [usesWeight, setUsesWeight] = useState(true);
  const [steps, setSteps] = useState("");
  const [touched, setTouched] = useState(false);
  const err = !name.trim() ? "Give the exercise a name." : null;
  const save = () => {
    setTouched(true);
    if (err) return;
    const id = uuid();
    const ex: Exercise = {
      id,
      slug: `custom-${id.slice(0, 8)}`,
      name: name.trim(),
      kind,
      primaryMuscles: muscles.split(",").map((s) => s.trim()).filter(Boolean),
      secondaryMuscles: [],
      equipment: equipment.split(",").map((s) => s.trim()).filter(Boolean).length ? equipment.split(",").map((s) => s.trim()).filter(Boolean) : ["None"],
      difficulty: "beginner",
      usesWeight: kind === "reps" ? usesWeight : false,
      startingPosition: "",
      steps: steps.split("\n").map((s) => s.trim()).filter(Boolean),
      mistakes: [],
      safety: [],
      animation: "generic",
      ownerId: user?.id ?? null,
      custom: true,
    };
    commit([upsert("exercises", ex)]);
    toast(`${ex.name} added to your library`, { tone: "success" });
    setName("");
    setMuscles("");
    setEquipment("");
    setSteps("");
    setTouched(false);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create exercise"
      description="Custom exercises appear in your library and plan editor, and sync with your account."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon="check" onClick={save}>
            Create exercise
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" error={touched ? err : null}>
          {(id) => <input id={id} className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cable Crunch" />}
        </Field>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Type</p>
          <Segmented
            label="Exercise type"
            value={kind}
            onChange={setKind}
            options={[
              { value: "reps", label: "Reps" },
              { value: "time", label: "Timed hold" },
              { value: "cardio", label: "Cardio" },
              { value: "mobility", label: "Mobility" },
            ]}
          />
        </div>
        <Field label="Muscles worked" hint="Separate with commas.">
          {(id) => <input id={id} className="field" value={muscles} onChange={(e) => setMuscles(e.target.value)} placeholder="Core, Obliques" />}
        </Field>
        <Field label="Equipment" hint="Separate with commas.">
          {(id) => <input id={id} className="field" value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="Cable machine" />}
        </Field>
        {kind === "reps" && <Switch label="Track weight" description="Show a weight field when you log sets." checked={usesWeight} onChange={setUsesWeight} />}
        <Field label="Instructions (optional)" hint="One step per line.">
          {(id) => <textarea id={id} className="field min-h-24" value={steps} onChange={(e) => setSteps(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
