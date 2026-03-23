/**
 * Icône du plugin Comments dans la sidebar Strapi.
 * Utilise l'icône Discuss (deux bulles de dialogue).
 */

import React from 'react';
import { Discuss } from '@strapi/icons';

const PluginIcon: React.FC = () => <Discuss aria-hidden="true" />;

export default PluginIcon;
