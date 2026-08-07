import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, Phone, MapPin, Send, ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { toast } from "sonner";
import { supabaseConfig, isSupabaseConfigured } from "@/lib/supabase";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  projectType: z.string().min(1, "Please select a project type"),
  message: z
    .string()
    .min(10, "Message must be at least 10 characters")
    .max(1000, "Message must be less than 1000 characters"),
});

type FormData = z.infer<typeof formSchema>;

const CONTACT_EMAIL = "info@yam.limited";

// A form that can hang forever is broken even when the network is fine. Fifteen
// seconds is far longer than a cold edge function needs, and it guarantees the
// visitor always gets an answer -- success, or the mailto fallback below.
const REQUEST_TIMEOUT_MS = 15_000;
// E.164 without '+' or spaces — the format wa.me requires.
const WHATSAPP_NUMBER = "393388162035";
const PHONE_DISPLAY = "+39 338 816 2035";
const WHATSAPP_PREFILL =
  "Hi YAM, I'd like to discuss a yacht project.";

const projectTypes = [
  { value: "new-build", label: "New Build Project" },
  { value: "refit", label: "Refit Project" },
  { value: "racing", label: "Racing Program" },
  { value: "consultation", label: "General Consultation" },
  { value: "other", label: "Other" },
];

const Contact = () => {
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      projectType: "",
      message: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    const label =
      projectTypes.find((p) => p.value === data.projectType)?.label ||
      data.projectType;

    try {
      if (!isSupabaseConfigured) {
        throw new Error("Supabase is not configured in this build");
      }

      // Deliberately a plain fetch rather than supabase.functions.invoke().
      //
      // invoke() awaits an access token from auth.getSession() before it sends
      // anything. If a visitor also has an app session in that browser, the
      // await can queue behind supabase-js's auth lock, and a token refresh
      // holding that lock never releases it — the request is then never sent.
      // Not slow: never sent. No network entry, no error, no rejection, so the
      // form sat with its button disabled forever and no message either way.
      //
      // This form is public. There is no session to attach and no token to
      // wait for, so it posts the anon key itself and skips auth entirely.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(
          `${supabaseConfig.url}/functions/v1/contact-inquiry`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: supabaseConfig.anonKey,
              Authorization: `Bearer ${supabaseConfig.anonKey}`,
            },
            body: JSON.stringify(data),
            signal: controller.signal,
          }
        );
      } finally {
        // Clear it either way: an uncleared timer would abort a request that
        // already came back, on a controller nobody is listening to.
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          `contact-inquiry responded ${response.status}${detail ? `: ${detail}` : ""}`
        );
      }

      toast.success("Message sent", {
        description: "Thanks — we'll get back to you shortly.",
      });
      form.reset();
    } catch (err) {
      console.error("Contact form submission failed", err);

      // Fall back to a mailto handoff so the inquiry isn't lost outright. Keep
      // the form contents too — there's no way to confirm the mail client
      // actually opened, so never claim success or clear what was typed.
      const subject = encodeURIComponent(`YAM Inquiry: ${label}`);
      const body = encodeURIComponent(
        `Name: ${data.name}\nEmail: ${data.email}\nPhone: ${data.phone || "Not provided"}\nProject Type: ${label}\n\nMessage:\n${data.message}`
      );
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;

      toast("Couldn't reach our server", {
        description: `Opening your email client as a backup. If nothing opens, write to ${CONTACT_EMAIL} or message us on WhatsApp — your text is still in the form.`,
        duration: 10000,
      });
    }
  };

  return (
    <section id="contact" className="py-24 section-muted">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">
            Get in Touch
          </h2>
          <h3 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
            Start Your Project Today
          </h3>
          <p className="text-lg text-muted-foreground">
            Ready to navigate your next maritime venture? Contact us to discuss
            how we can support your yacht project.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-12 max-w-6xl mx-auto">
          {/* Contact Info */}
          <div className="lg:col-span-1 space-y-8">
            <div className="flex items-start gap-4">
              <div className="icon-container flex-shrink-0">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">Email</h4>
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-muted-foreground hover:text-accent transition-colors"
                >
                  {CONTACT_EMAIL}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="icon-container flex-shrink-0">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">Phone</h4>
                <a
                  href={`tel:+${WHATSAPP_NUMBER}`}
                  className="text-muted-foreground hover:text-accent transition-colors"
                >
                  {PHONE_DISPLAY}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="icon-container flex-shrink-0">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">WhatsApp</h4>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_PREFILL)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-accent transition-colors"
                >
                  Send a quick message
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="icon-container flex-shrink-0">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-1">Location</h4>
                <p className="text-muted-foreground">
                  Mediterranean & Worldwide
                </p>
              </div>
            </div>

            {/* Digital Logbook Promo */}
            <div className="mt-8 p-6 rounded-xl border border-accent/20 bg-accent/5">
              <h4 className="font-semibold text-foreground mb-2">Digital Logbook</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Streamline your yacht operations with our digital logbook solution.
              </p>
              <a
                href="https://digital-logbook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-accent hover:text-accent/80 transition-colors text-sm font-medium"
              >
                Learn more <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="card-elevated p-8 space-y-6"
              >
                <div className="grid sm:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Your name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address *</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="your@email.com"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+39 338 816 2035" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="projectType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Project Type *</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select project type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {projectTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your Message *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us about your project..."
                          className="min-h-[120px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <div className="flex justify-between">
                        <FormMessage />
                        <span className="text-xs text-muted-foreground">
                          {field.value.length}/1000
                        </span>
                      </div>
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  size="lg"
                  className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                  disabled={form.formState.isSubmitting}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Send Inquiry
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
