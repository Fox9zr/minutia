"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "motion/react";
import { createSeriesSchema, type CreateSeriesInput } from "@/lib/schemas";
import { useCreateSeries } from "@/lib/hooks/use-серия";
import { CADENCES, CADENCE_LABELS } from "@/lib/constants";
import type { Cadence } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { MinutiaCadenceIcon } from "@/components/minutia/minutia-icons";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface CreateSeriesDialogProps {
  открыто: boolean;
  onOpenChange: (открыто: boolean) => void;
}

export function CreateSeriesDialog({
  открыто,
  onOpenChange,
}: CreateSeriesDialogProps) {
  const createSeries = useCreateSeries();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateSeriesInput>({
    resolver: zodResolver(createSeriesSchema as any),
    defaultValues: {
      name: "",
      description: "",
      cadence: "weekly",
      default_attendees: [],
    },
  });

  const selectedCadence = watch("cadence");

  async function onSubmit(data: CreateSeriesInput) {
    await createSeries.mutateAsync(data);
    reset();
    onOpenChange(false);
  }

  function handleAttendeesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const attendees = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setValue("default_attendees", attendees);
  }

  return (
    <Dialog открыто={открыто} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0" showCloseButton>
        <div className="px-8 pt-8 pb-2">
          <DialogHeader className="space-y-1.5 mb-0">
            <DialogTitle className="font-display text-xl">Создать серию</DialogTitle>
            <DialogDescription className="text-sm text-ink-3">
              A серия groups your recurring meetings together.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-8 pb-8 space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="серия-name" className="text-sm font-semibold text-ink">Название</Label>
            <Input
              id="серия-name"
              placeholder="e.g. Еженедельно Standup"
              {...register("name")}
              aria-invalid={!!errors.name}
              className="h-11"
            />
            {errors.name && (
              <p className="text-xs text-danger">{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="серия-description" className="text-sm font-semibold text-ink">Описание</Label>
            <Textarea
              id="серия-description"
              placeholder="Необязательное описание"
              {...register("description")}
              className="min-h-[100px]"
            />
          </div>

          {/* Cadence */}
          <div className="space-y-2.5">
            <Label className="text-sm font-semibold text-ink">Периодичность</Label>
            <RadioGroup
              value={selectedCadence}
              onValueChange={(value) => setValue("cadence", value as Cadence)}
              aria-label="Периодичность"
              className="flex flex-wrap gap-1 rounded-full bg-paper-2 p-1"
            >
              {CADENCES.map((cadence) => (
                <RadioGroupItem
                  key={cadence}
                  value={cadence}
                  className={cn(
                    "relative aspect-auto size-auto cursor-pointer rounded-full border-0 px-4 py-1.5 text-sm font-medium shadow-none outline-none transition-colors",
                    selectedCadence === cadence
                      ? "text-paper"
                      : "text-ink-3 hover:text-ink-2"
                  )}
                >
                  {selectedCadence === cadence && (
                    <motion.span
                      layoutId="cadence-active-pill-create"
                      className="absolute inset-0 -z-10 rounded-full bg-ink"
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    />
                  )}
                  <span className="relative inline-flex items-center gap-1.5">
                    <MinutiaCadenceIcon cadence={cadence} className="size-3.5 text-current" />
                    {CADENCE_LABELS[cadence]}
                  </span>
                </RadioGroupItem>
              ))}
            </RadioGroup>
          </div>

          {/* Default attendees */}
          <div className="space-y-2">
            <Label htmlFor="серия-attendees" className="text-sm font-semibold text-ink">Участники по умолчанию</Label>
            <Input
              id="серия-attendees"
              placeholder="email@example.com, another@example.com"
              onChange={handleAttendeesChange}
              className="h-11"
            />
            <p className="text-xs text-ink-4">Email через запятую</p>
          </div>

          <div className="border-t border-rule pt-6 flex justify-end">
            <Button variant="accent"
              type="submit"
              disabled={createSeries.isPending}
              className="px-6 h-10"
            >
              {createSeries.isPending && (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              Create серия
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
