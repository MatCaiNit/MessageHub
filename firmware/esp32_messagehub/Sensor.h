#ifndef SENSOR_H
#define SENSOR_H

#include <Arduino.h>

struct Sensor {
  const char* id;
  const char* label;
  bool        enabled;
};

#endif