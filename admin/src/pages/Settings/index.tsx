/**
 * Page Settings — paramètres éditables du plugin Comments.
 *
 * Layout : chaque paramètre est affiché sur une ligne,
 * avec le label + description à gauche (col 6) et le contrôle à droite (col 6),
 * aligné sur le pattern Media Library de l'admin Strapi.
 *
 * Les paramètres sont stockés en base via l'API store Strapi.
 *
 * Design System Strapi : Toggle, TextInput, NumberInput, SingleSelect, Grid.
 * RGAA 4.1 : critère 11.1 — chaque champ a un label explicite.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Flex,
  Typography,
  Button,
  Loader,
  Grid,
  Toggle,
  TextInput,
  NumberInput,
  SingleSelect,
  SingleSelectOption,
  Divider,
  Badge,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../../pluginId';
import { useLicense } from '../../hooks/useLicense';

interface PluginSettings {
  requireApproval: boolean;
  profanityFilterEnabled: boolean;
  profanityFilterLanguages: string[];
  profanityFilterAction: 'block' | 'sanitize';
  rateLimitEnabled: boolean;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  rateLimitWhitelist: string;
  avatarEnabled: boolean;
  subscriberEnabled: boolean;
  subscriberCategoryName: string;
  moderationEnabled: boolean;
  reportThresholdEnabled: boolean;
  reportThresholdCount: number;
  recaptchaEnabled: boolean;
  recaptchaSiteKey: string;
  recaptchaSecretKey: string;
  recaptchaMinScore: number;
}

const DEFAULTS: PluginSettings = {
  requireApproval: false,
  profanityFilterEnabled: true,
  profanityFilterLanguages: ['fr', 'en'],
  profanityFilterAction: 'block',
  rateLimitEnabled: true,
  rateLimitMax: 5,
  rateLimitWindowMs: 60000,
  rateLimitWhitelist: '',
  avatarEnabled: true,
  subscriberEnabled: true,
  subscriberCategoryName: 'Abonné',
  moderationEnabled: false,
  reportThresholdEnabled: true,
  reportThresholdCount: 3,
  recaptchaEnabled: false,
  recaptchaSiteKey: '',
  recaptchaSecretKey: '',
  recaptchaMinScore: 0.5,
};

/* ─── Ligne de paramètre : label+description à gauche, contrôle à droite ─────
 * Reproduit le pattern des formulaires Strapi (Media Library, Users & Permissions).
 * RGAA 4.1 — critère 11.1 : association label/contrôle assurée par les composants DS.
 */
const SettingRow: React.FC<{
  label: string;
  description: string;
  control: React.ReactNode;
  /** Dernière ligne d'une section : supprime le séparateur bas */
  isLast?: boolean;
}> = ({ label, description, control, isLast = false }) => (
  <>
    <Grid.Root gap={4} style={{ padding: '16px 0' }}>
      {/* Col gauche : label + description */}
      <Grid.Item col={6} s={12}>
        <Box>
          <Typography variant="omega" fontWeight="semiBold" textColor="neutral800">
            {label}
          </Typography>
          <Typography variant="pi" textColor="neutral600" tag="p" style={{ marginTop: '4px' }}>
            {description}
          </Typography>
        </Box>
      </Grid.Item>
      {/* Col droite : contrôle */}
      <Grid.Item col={6} s={12}>
        <Flex justifyContent="flex-end" alignItems="center" height="100%">
          {control}
        </Flex>
      </Grid.Item>
    </Grid.Root>
    {!isLast && <Divider />}
  </>
);

/* ─── Section avec titre et bordure ──────────────────────────────────────────
 * Pattern identique aux blocs de paramètres de l'admin Strapi.
 */
const SettingSection: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <Box
    background="neutral0"
    hasRadius
    padding={6}
    style={{ border: '1px solid var(--colors-neutral200)' }}
  >
    {/* Titre de section — RGAA 4.1 critère 9.1 : hiérarchie de titres respectée */}
    <Typography variant="delta" tag="h2">
      {title}
    </Typography>
    <Box marginTop={4}>
      {children}
    </Box>
  </Box>
);

const Settings: React.FC = () => {
  const { get, put } = useFetchClient();
  const [settings, setSettings] = useState<PluginSettings>(DEFAULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lecture de l'état de la licence — fail-open : en cas d'erreur, tier Community affiché
  const { license, isLoading: licenseLoading, refetch: refetchLicense } = useLicense();

  // État local pour la vérification de clé dans la section Licence
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [licenseVerifyResult, setLicenseVerifyResult] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await get(`/${pluginId}/admin/settings`);
      const data = response?.data?.data;
      if (data) {
        setSettings({ ...DEFAULTS, ...data });
      }
    } catch {
      setError('Impossible de charger les paramètres.');
    } finally {
      setIsLoading(false);
    }
  }, [get]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    setError(null);
    try {
      await put(`/${pluginId}/admin/settings`, settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Erreur lors de la sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

  const update = <K extends keyof PluginSettings>(key: K, value: PluginSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  /**
   * Vérifie une clé de licence via l'API admin du plugin.
   * Ne persiste pas la clé — indique simplement si elle est valide.
   * La clé doit être configurée dans .env (COMMENTS_LICENSE_KEY) pour être prise en compte.
   *
   * SÉCURITÉ : on envoie la clé uniquement vers l'API admin Strapi (is-admin protégée),
   * jamais vers un service tiers en V1.
   */
  const handleVerifyLicense = useCallback(async () => {
    if (!licenseKeyInput.trim()) return;

    setIsVerifying(true);
    setLicenseVerifyResult(null);

    try {
      const response = await put<{ data: { valid: boolean; tier: string; message: string } }>(
        `/${pluginId}/admin/license/verify`,
        { licenseKey: licenseKeyInput.trim() }
      );
      const result = response?.data?.data;
      if (result) {
        setLicenseVerifyResult({ valid: result.valid, message: result.message });
        // Si valide, rafraîchir l'état de licence affiché
        if (result.valid) {
          refetchLicense();
        }
      }
    } catch {
      setLicenseVerifyResult({
        valid: false,
        message: 'Erreur lors de la vérification. Vérifiez votre connexion.',
      });
    } finally {
      setIsVerifying(false);
    }
  }, [licenseKeyInput, put, refetchLicense]);

  if (isLoading) {
    return (
      <Flex justifyContent="center" padding={10}>
        <Loader>Chargement des paramètres...</Loader>
      </Flex>
    );
  }

  return (
    <Box padding={8} background="neutral100">
      {/* ── Header avec bouton Sauvegarder ──────────────────────────────────── */}
      <Flex justifyContent="space-between" alignItems="center" marginBottom={6}>
        <Box>
          <Typography variant="alpha" tag="h1">Paramètres</Typography>
          <Typography variant="epsilon" textColor="neutral600" tag="p">
            Configuration du plugin Commentaires
          </Typography>
        </Box>
        <Flex gap={2} alignItems="center">
          {saved && (
            <Typography textColor="success600" variant="omega">Sauvegardé</Typography>
          )}
          {error && (
            <Typography textColor="danger600" variant="omega">{error}</Typography>
          )}
          <Button onClick={handleSave} loading={isSaving}>
            Sauvegarder
          </Button>
        </Flex>
      </Flex>

      <Flex direction="column" gap={6}>

        {/* ── Section Modération ──────────────────────────────────────────────── */}
        <SettingSection title="Modération">
          <SettingRow
            label="Activer la modération"
            description="Quand activée, les nouveaux commentaires doivent être approuvés par un administrateur avant d'apparaître sur le site."
            control={
              <Toggle
                label="Activer la modération"
                aria-label="Activer la modération"
                onLabel="Activée"
                offLabel="Désactivée"
                checked={settings.moderationEnabled}
                onChange={(e: { target: { checked: boolean } }) =>
                  update('moderationEnabled', e.target.checked)
                }
              />
            }
          />
          <SettingRow
            label="Approbation requise par défaut"
            description="Les commentaires sont placés en attente de modération par défaut au lieu d'être publiés immédiatement."
            control={
              <Toggle
                label="Approbation requise par défaut"
                aria-label="Approbation requise par défaut"
                onLabel="Oui"
                offLabel="Non"
                checked={settings.requireApproval}
                onChange={(e: { target: { checked: boolean } }) =>
                  update('requireApproval', e.target.checked)
                }
              />
            }
            isLast
          />
        </SettingSection>

        {/* ── Section Filtre anti-injures ─────────────────────────────────────── */}
        <SettingSection title="Filtre anti-injures">
          <SettingRow
            label="Activer le filtre"
            description="Analyse le contenu des commentaires pour détecter les mots inappropriés en français et anglais via la bibliothèque leo-profanity."
            control={
              <Toggle
                label="Activer le filtre anti-injures"
                aria-label="Activer le filtre anti-injures"
                onLabel="Activé"
                offLabel="Désactivé"
                checked={settings.profanityFilterEnabled}
                onChange={(e: { target: { checked: boolean } }) =>
                  update('profanityFilterEnabled', e.target.checked)
                }
              />
            }
            isLast={!settings.profanityFilterEnabled}
          />
          {settings.profanityFilterEnabled && (
            <SettingRow
              label="Action en cas de détection"
              description="Bloquer : le commentaire est rejeté. Masquer : les mots détectés sont remplacés par des astérisques (***) et le commentaire est publié."
              control={
                <Box style={{ minWidth: '220px' }}>
                  <SingleSelect
                    label="Action en cas de détection"
                    aria-label="Action en cas de détection d'une injure"
                    value={settings.profanityFilterAction}
                    onChange={(value: string) =>
                      update('profanityFilterAction', value as 'block' | 'sanitize')
                    }
                  >
                    <SingleSelectOption value="block">Bloquer le commentaire</SingleSelectOption>
                    <SingleSelectOption value="sanitize">Masquer les mots (***)</SingleSelectOption>
                  </SingleSelect>
                </Box>
              }
              isLast
            />
          )}
        </SettingSection>

        {/* ── Section Limitation de débit ─────────────────────────────────────── */}
        <SettingSection title="Limitation de débit">
          <SettingRow
            label="Activer la limitation"
            description="Empêche un utilisateur de publier trop de commentaires dans un court laps de temps. Protection contre le spam."
            control={
              <Toggle
                label="Activer la limitation de débit"
                aria-label="Activer la limitation de débit"
                onLabel="Activée"
                offLabel="Désactivée"
                checked={settings.rateLimitEnabled}
                onChange={(e: { target: { checked: boolean } }) =>
                  update('rateLimitEnabled', e.target.checked)
                }
              />
            }
            isLast={!settings.rateLimitEnabled}
          />
          {settings.rateLimitEnabled && (
            <>
              <SettingRow
                label="Nombre maximum de commentaires"
                description="Nombre maximum de commentaires autorisés par adresse IP dans la fenêtre de temps définie."
                control={
                  <Box style={{ minWidth: '140px' }}>
                    <NumberInput
                      label="Nombre maximum de commentaires"
                      aria-label="Nombre maximum de commentaires par IP"
                      value={settings.rateLimitMax}
                      onValueChange={(value: number) => update('rateLimitMax', value)}
                    />
                  </Box>
                }
              />
              <SettingRow
                label="Fenêtre de temps (ms)"
                description="Durée en millisecondes pendant laquelle le compteur de commentaires est actif. 60000 = 1 minute, 300000 = 5 minutes."
                control={
                  <Box style={{ minWidth: '160px' }}>
                    <NumberInput
                      label="Fenêtre de temps en millisecondes"
                      aria-label="Fenêtre de temps en millisecondes"
                      value={settings.rateLimitWindowMs}
                      onValueChange={(value: number) => update('rateLimitWindowMs', value)}
                    />
                  </Box>
                }
              />
              <SettingRow
                label="IPs autorisées (whitelist)"
                description="Adresses IP exclues du rate limiting, séparées par des virgules. Localhost (127.0.0.1) est toujours autorisé. Exemple : 192.168.1.100, 10.0.0.1"
                control={
                  <Box style={{ minWidth: '300px' }}>
                    <TextInput
                      label="IPs autorisées"
                      aria-label="Liste d'adresses IP autorisées séparées par des virgules"
                      placeholder="192.168.1.100, 10.0.0.1"
                      value={settings.rateLimitWhitelist}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        update('rateLimitWhitelist', e.target.value)
                      }
                    />
                  </Box>
                }
                isLast
              />
            </>
          )}
        </SettingSection>

        {/* ── Section Google reCAPTCHA V3 ─────────────────────────────────────── */}
        <SettingSection title="Google reCAPTCHA V3">
          <SettingRow
            label="Activer reCAPTCHA"
            description="Protection anti-bot Google reCAPTCHA V3 (invisible). Nécessite une paire de clés obtenues sur console.cloud.google.com."
            control={
              <Toggle
                label="Activer reCAPTCHA V3"
                aria-label="Activer Google reCAPTCHA V3"
                onLabel="Activé"
                offLabel="Désactivé"
                checked={settings.recaptchaEnabled}
                onChange={(e: { target: { checked: boolean } }) =>
                  update('recaptchaEnabled', e.target.checked)
                }
              />
            }
            isLast={!settings.recaptchaEnabled}
          />
          {settings.recaptchaEnabled && (
            <>
              <SettingRow
                label="Clé du site (Site Key)"
                description="Clé publique fournie par Google reCAPTCHA, à intégrer dans le frontend de votre site."
                control={
                  <Box style={{ minWidth: '300px' }}>
                    <TextInput
                      label="Clé du site reCAPTCHA"
                      aria-label="Clé du site reCAPTCHA (Site Key)"
                      placeholder="6Le..."
                      value={settings.recaptchaSiteKey}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        update('recaptchaSiteKey', e.target.value)
                      }
                    />
                  </Box>
                }
              />
              <SettingRow
                label="Clé secrète (Secret Key)"
                description="Clé privée utilisée côté serveur pour vérifier les tokens reCAPTCHA. Ne jamais l'exposer côté client."
                control={
                  <Box style={{ minWidth: '300px' }}>
                    <TextInput
                      label="Clé secrète reCAPTCHA"
                      aria-label="Clé secrète reCAPTCHA (Secret Key)"
                      type="password"
                      placeholder="6Le..."
                      value={settings.recaptchaSecretKey}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        update('recaptchaSecretKey', e.target.value)
                      }
                    />
                  </Box>
                }
              />
              <SettingRow
                label="Score minimum (0 à 1)"
                description="Score entre 0 et 1 attribué par Google. En dessous de ce seuil, le commentaire est rejeté. Recommandé : 0.5."
                control={
                  <Box style={{ minWidth: '140px' }}>
                    <NumberInput
                      label="Score minimum reCAPTCHA"
                      aria-label="Score minimum reCAPTCHA entre 0 et 1"
                      value={settings.recaptchaMinScore}
                      step={0.1}
                      onValueChange={(value: number) => update('recaptchaMinScore', value)}
                    />
                  </Box>
                }
                isLast
              />
            </>
          )}
        </SettingSection>

        {/* ── Section Signalements ────────────────────────────────────────────── */}
        <SettingSection title="Signalements">
          <SettingRow
            label="Masquage automatique"
            description="Nombre de signalements différents nécessaires pour masquer automatiquement un commentaire en attente de modération."
            control={
              <Toggle
                label="Masquage automatique après N signalements"
                aria-label="Activer le masquage automatique après N signalements"
                onLabel="Activé"
                offLabel="Désactivé"
                checked={settings.reportThresholdEnabled}
                onChange={(e: { target: { checked: boolean } }) =>
                  update('reportThresholdEnabled', e.target.checked)
                }
              />
            }
            isLast={!settings.reportThresholdEnabled}
          />
          {settings.reportThresholdEnabled && (
            <SettingRow
              label="Seuil de signalements"
              description="Nombre de signalements différents nécessaires pour masquer automatiquement un commentaire en attente de modération."
              control={
                <Box style={{ minWidth: '140px' }}>
                  <NumberInput
                    label="Seuil de signalements"
                    aria-label="Nombre de signalements avant masquage automatique"
                    value={settings.reportThresholdCount}
                    onValueChange={(value: number) => update('reportThresholdCount', value)}
                  />
                </Box>
              }
              isLast
            />
          )}
        </SettingSection>

        {/* ── Section Fonctionnalités ─────────────────────────────────────────── */}
        <SettingSection title="Fonctionnalités">
          <SettingRow
            label="Avatars automatiques"
            description="Génère automatiquement un avatar coloré avec l'initiale du prénom du commentateur."
            control={
              <Toggle
                label="Avatars automatiques"
                aria-label="Activer les avatars automatiques"
                onLabel="Activé"
                offLabel="Désactivé"
                checked={settings.avatarEnabled}
                onChange={(e: { target: { checked: boolean } }) =>
                  update('avatarEnabled', e.target.checked)
                }
              />
            }
          />
          <SettingRow
            label="Abonnement automatique"
            description="Crée automatiquement un compte utilisateur Strapi pour chaque commentateur et lui attribue la catégorie définie ci-dessous."
            control={
              <Toggle
                label="Abonnement automatique"
                aria-label="Activer l'abonnement automatique des commentateurs"
                onLabel="Activé"
                offLabel="Désactivé"
                checked={settings.subscriberEnabled}
                onChange={(e: { target: { checked: boolean } }) =>
                  update('subscriberEnabled', e.target.checked)
                }
              />
            }
            isLast={!settings.subscriberEnabled}
          />
          {settings.subscriberEnabled && (
            <SettingRow
              label="Catégorie abonné"
              description="Nom de la catégorie (rôle) attribué automatiquement aux nouveaux commentateurs lors de la création de leur compte."
              control={
                <Box style={{ minWidth: '220px' }}>
                  <TextInput
                    label="Nom de la catégorie abonné"
                    aria-label="Nom de la catégorie attribuée aux nouveaux abonnés"
                    value={settings.subscriberCategoryName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      update('subscriberCategoryName', e.target.value)
                    }
                  />
                </Box>
              }
              isLast
            />
          )}
        </SettingSection>

        {/* ── Section Licence ─────────────────────────────────────────────── */}
        <SettingSection title="Licence">
          {licenseLoading ? (
            <Flex justifyContent="center" padding={4}>
              <Loader small>Chargement...</Loader>
            </Flex>
          ) : (
            <>
              {/* Tier actuel */}
              <SettingRow
                label="Tier actuel"
                description="Tier de licence actif pour ce plugin. Community est gratuit et limité à 500 commentaires. Pro déverrouille toutes les fonctionnalités."
                control={
                  <Flex gap={2} alignItems="center">
                    {license?.tier === 'pro' ? (
                      <Badge backgroundColor="primary100" textColor="primary700">
                        Pro
                      </Badge>
                    ) : (
                      <Badge backgroundColor="neutral150" textColor="neutral700">
                        Community
                      </Badge>
                    )}
                    {license?.tier === 'community' && license.commentLimit && (
                      <Typography variant="pi" textColor="neutral500">
                        {license.commentCount}/{license.commentLimit} commentaires
                      </Typography>
                    )}
                    {license?.tier === 'pro' && license.maskedKey && (
                      <Typography variant="pi" textColor="neutral400" style={{ fontFamily: 'monospace' }}>
                        {license.maskedKey}
                      </Typography>
                    )}
                  </Flex>
                }
              />

              {/* Fonctionnalités disponibles */}
              <SettingRow
                label="Fonctionnalités déverrouillées"
                description="Liste des fonctionnalités actives selon votre tier de licence."
                control={
                  <Box>
                    <Flex gap={2} style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {[
                        { key: 'crud', label: 'CRUD commentaires' },
                        { key: 'profanityFilter', label: 'Filtre anti-injures' },
                        { key: 'avatar', label: 'Avatars' },
                        { key: 'likes', label: 'Likes' },
                        { key: 'adminBasic', label: 'Admin basique' },
                        { key: 'unlimitedComments', label: 'Commentaires illimités' },
                        { key: 'bulkActions', label: 'Actions en masse' },
                        { key: 'pinning', label: 'Épinglage' },
                        { key: 'reports', label: 'Signalements' },
                        { key: 'adminReply', label: 'Réponse admin' },
                        { key: 'rateLimit', label: 'Rate limiting avancé' },
                        { key: 'recaptcha', label: 'reCAPTCHA' },
                      ].map(({ key, label }) => {
                        const active = license?.features[key as keyof typeof license.features] ?? false;
                        return (
                          <Badge
                            key={key}
                            backgroundColor={active ? 'success100' : 'neutral100'}
                            textColor={active ? 'success700' : 'neutral500'}
                            aria-label={`${label} : ${active ? 'disponible' : 'non disponible'}`}
                          >
                            {label}
                          </Badge>
                        );
                      })}
                    </Flex>
                  </Box>
                }
              />

              {/* Vérification de clé — affiché uniquement en tier Community */}
              {license?.tier === 'community' && (
                <SettingRow
                  label="Vérifier une clé de licence"
                  description={
                    `Testez une clé au format ISOMORPH-COMMENTS-XXXX-XXXX-XXXX-XXXX avant de la configurer dans votre .env (variable COMMENTS_LICENSE_KEY).`
                  }
                  control={
                    <Flex gap={2} alignItems="flex-start" style={{ flexDirection: 'column', minWidth: '320px' }}>
                      <Flex gap={2} alignItems="center" style={{ width: '100%' }}>
                        {/* type="password" : masque la clé — OWASP A01 */}
                        <TextInput
                          label="Clé de licence"
                          aria-label="Clé de licence à vérifier (format ISOMORPH-COMMENTS-XXXX-XXXX-XXXX-XXXX)"
                          type="password"
                          placeholder="ISOMORPH-COMMENTS-XXXX-XXXX-XXXX-XXXX"
                          value={licenseKeyInput}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setLicenseKeyInput(e.target.value);
                            setLicenseVerifyResult(null);
                          }}
                          style={{ flex: 1 }}
                        />
                        <Button
                          onClick={handleVerifyLicense}
                          loading={isVerifying}
                          disabled={!licenseKeyInput.trim() || isVerifying}
                          size="S"
                          style={{ flexShrink: 0 }}
                        >
                          Vérifier
                        </Button>
                      </Flex>
                      {/* Résultat de la vérification */}
                      {licenseVerifyResult && (
                        <Typography
                          variant="pi"
                          textColor={licenseVerifyResult.valid ? 'success600' : 'danger600'}
                          role="alert"
                          aria-live="polite"
                        >
                          {licenseVerifyResult.message}
                        </Typography>
                      )}
                      {license.upgradeUrl && (
                        <Typography variant="pi" textColor="neutral500">
                          Pas encore de licence ?{' '}
                          <a
                            href={license.upgradeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--colors-primary600)' }}
                            aria-label="Obtenir une licence Pro (ouvre un nouvel onglet)"
                          >
                            Obtenir une licence Pro
                          </a>
                        </Typography>
                      )}
                    </Flex>
                  }
                  isLast
                />
              )}

              {license?.tier === 'pro' && (
                <SettingRow
                  label="Licence Pro active"
                  description="Votre licence Pro est active. Toutes les fonctionnalités sont déverrouillées. La clé est configurée via la variable d'environnement COMMENTS_LICENSE_KEY."
                  control={
                    <Badge backgroundColor="success100" textColor="success700">
                      Active
                    </Badge>
                  }
                  isLast
                />
              )}
            </>
          )}
        </SettingSection>

      </Flex>
    </Box>
  );
};

export default Settings;
