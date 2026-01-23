import React, { useState } from 'react';
import './WidgetSelector.scss';

type WidgetType =
  | 'voting_ballot'
  | 'leaderboard'
  | 'battle_royale'
  | 'tournament_bracket'
  | 'about'
  | 'now_playing';

interface WidgetConfig {
  type: WidgetType;
  order: number;
}

interface WidgetOption {
  type: WidgetType;
  name: string;
  description: string;
  icon: string;
  recommendedFor: string[];
}

const WIDGET_OPTIONS: WidgetOption[] = [
  {
    type: 'voting_ballot',
    name: 'Voting Ballot',
    description: 'Rate and support your favorite entries',
    icon: '🗳️',
    recommendedFor: ['film_festival']
  },
  {
    type: 'leaderboard',
    name: 'Leaderboard',
    description: 'Top-ranked filmmakers',
    icon: '🏆',
    recommendedFor: ['film_festival']
  },
  {
    type: 'battle_royale',
    name: 'Battle Royale',
    description: 'Head-to-head matchups',
    icon: '⚔️',
    recommendedFor: ['battle_royal']
  },
  {
    type: 'tournament_bracket',
    name: 'Tournament Bracket',
    description: 'Competition progression',
    icon: '🏅',
    recommendedFor: ['tournament']
  },
  {
    type: 'about',
    name: 'About',
    description: 'Channel info and description',
    icon: 'ℹ️',
    recommendedFor: ['film_festival', 'battle_royal', 'tournament']
  },
  {
    type: 'now_playing',
    name: 'Now Playing / Up Next',
    description: 'Current and upcoming content',
    icon: '📺',
    recommendedFor: ['film_festival', 'battle_royal', 'tournament']
  }
];

interface Props {
  eventType: string;
  selectedWidgets: WidgetConfig[];
  onChange: (widgets: WidgetConfig[]) => void;
}

const WidgetSelector: React.FC<Props> = ({ eventType, selectedWidgets, onChange }) => {
  const toggleWidget = (widgetType: WidgetType) => {
    const exists = selectedWidgets.find(w => w.type === widgetType);

    if (exists) {
      // Remove widget
      onChange(selectedWidgets.filter(w => w.type !== widgetType));
    } else {
      // Add widget with next order
      const maxOrder = Math.max(...selectedWidgets.map(w => w.order), -1);
      onChange([...selectedWidgets, { type: widgetType, order: maxOrder + 1 }]);
    }
  };

  const isSelected = (widgetType: WidgetType) => {
    return selectedWidgets.some(w => w.type === widgetType);
  };

  const isRecommended = (widget: WidgetOption) => {
    return widget.recommendedFor.includes(eventType);
  };

  return (
    <div className="widget-selector">
      <h4>Choose Widgets for "The Pit"</h4>
      <p className="help-text">Select which widgets to display in your channel menu. You can reorder them later.</p>

      <div className="widget-grid">
        {WIDGET_OPTIONS.map(widget => (
          <label
            key={widget.type}
            className={`widget-option ${isSelected(widget.type) ? 'selected' : ''}`}
          >
            <input
              type="checkbox"
              checked={isSelected(widget.type)}
              onChange={() => toggleWidget(widget.type)}
            />
            <div className="widget-card">
              <span className="widget-icon">{widget.icon}</span>
              <div className="widget-info">
                <strong>{widget.name}</strong>
                {isRecommended(widget) && <span className="badge">Recommended</span>}
                <p>{widget.description}</p>
              </div>
            </div>
          </label>
        ))}
      </div>

      {selectedWidgets.length === 0 && (
        <p className="warning">Select at least one widget to display in your channel menu.</p>
      )}
    </div>
  );
};

export default WidgetSelector;
